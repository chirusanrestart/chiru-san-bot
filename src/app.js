import "dotenv/config";

import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} from "@whiskeysockets/baileys";

import P from "pino";
import { Boom } from "@hapi/boom";

import readline from "node:readline";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

import CommandHandler from "./handlers/CommandHandler.js";

import {
    isEnabled
} from "./services/autoSticker.js";

import {
    downloadMedia
} from "./utils/download.js";

import {
    createSticker
} from "./services/sticker.js";

import {
    sendStickerPack
} from "./services/stickerPack.js";

const rl =
    readline.createInterface({
        input:
            process.stdin,

        output:
            process.stdout
    });

const AUTO_STICKER_WAIT =
    2000;

const autoStickerBuffers =
    new Map();

const autoStickerTimers =
    new Map();

let activeSocket = null;
let startPromise = null;

// Nunca deixe uma rejeição global derrubar o processo silenciosamente.
process.on("unhandledRejection", error => {
    console.error("❌ Promise rejeitada sem tratamento:", error);
});

process.on("uncaughtException", error => {
    console.error("💥 Exceção não capturada:", error);
    console.error("🔄 Encerrando para o PM2 reiniciar o bot com estado limpo...");
    setTimeout(() => process.exit(1), 250);
});

const sleep =
    ms =>
        new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );

const randomDelay =
    () =>
        Math.floor(
            Math.random() *
            201
        ) + 500;

// A thread principal agenda mensagens e limita concorrência;
// não espera um atraso artificial entre cada mensagem recebida.
// Concorrência configurável, sem teto artificial de 4 tarefas.
// Valor padrão alto para absorver rajadas; ajuste via MESSAGE_CONCURRENCY se necessário.
const MESSAGE_CONCURRENCY = Math.max(
    1,
    Number.parseInt(process.env.MESSAGE_CONCURRENCY || "32", 10) || 32
);

// Fila sem limite fixo de mensagens: tarefas são processadas gradualmente
// pela concorrência configurada, evitando descartar mensagens durante picos.
const incomingMessages = [];
let activeMessageTasks = 0;

// Auto-sticker adapta a concorrência à latência observada.
// Começa com 1 conversão e ajusta gradualmente, respeitando o teto seguro de 3.
const AUTO_STICKER_MAX_CONCURRENCY = Math.max(
    1,
    Math.min(
        3,
        Number.parseInt(
            process.env.AUTO_STICKER_MAX_CONCURRENCY ||
            process.env.AUTO_STICKER_CONCURRENCY ||
            "3",
            10
        ) || 3
    )
);
const AUTO_STICKER_QUEUE_LIMIT = 300;
const AUTO_STICKER_BASELINE_SAMPLE_COUNT = 3;
const AUTO_STICKER_LATENCY_WINDOW = 5;
const AUTO_STICKER_ADJUSTMENT_COOLDOWN_MS = 10000;
const autoStickerJobs = [];
const autoStickerBaselineDurations = [];
const autoStickerRecentDurations = [];
let autoStickerBaselineMs = null;
let autoStickerConcurrency = 1;
let autoStickerGoodSamples = 0;
let autoStickerSlowSamples = 0;
let autoStickerLastAdjustmentAt = 0;
let activeAutoStickerJobs = 0;

function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function adaptAutoStickerConcurrency(durationMs, concurrencyAtStart, failed) {
    if (concurrencyAtStart === 1 &&
        autoStickerBaselineDurations.length < AUTO_STICKER_BASELINE_SAMPLE_COUNT &&
        !failed) {
        autoStickerBaselineDurations.push(durationMs);

        if (autoStickerBaselineDurations.length === AUTO_STICKER_BASELINE_SAMPLE_COUNT) {
            autoStickerBaselineMs = average(autoStickerBaselineDurations);
            console.log(
                `📊 Auto-sticker: latência inicial de referência ${Math.round(autoStickerBaselineMs)} ms`
            );
        }
    }

    autoStickerRecentDurations.push(durationMs);
    if (autoStickerRecentDurations.length > AUTO_STICKER_LATENCY_WINDOW) {
        autoStickerRecentDurations.shift();
    }

    const now = Date.now();
    if (now - autoStickerLastAdjustmentAt < AUTO_STICKER_ADJUSTMENT_COOLDOWN_MS) {
        return;
    }

    if (failed && autoStickerConcurrency > 1) {
        autoStickerConcurrency--;
        autoStickerGoodSamples = 0;
        autoStickerSlowSamples = 0;
        autoStickerLastAdjustmentAt = now;
        console.warn(`⚠️ Auto-sticker: falha detectada, reduzindo concorrência para ${autoStickerConcurrency}`);
        return;
    }

    if (autoStickerBaselineMs === null || autoStickerRecentDurations.length < AUTO_STICKER_LATENCY_WINDOW) {
        return;
    }

    const recentAverage = average(autoStickerRecentDurations);
    if (recentAverage > autoStickerBaselineMs * 1.6) {
        autoStickerSlowSamples++;
        autoStickerGoodSamples = 0;
    } else if (recentAverage <= autoStickerBaselineMs * 1.25) {
        autoStickerGoodSamples++;
        autoStickerSlowSamples = 0;
    } else {
        autoStickerGoodSamples = 0;
        autoStickerSlowSamples = 0;
    }

    if (autoStickerSlowSamples >= 3 && autoStickerConcurrency > 1) {
        autoStickerConcurrency--;
        autoStickerGoodSamples = 0;
        autoStickerSlowSamples = 0;
        autoStickerLastAdjustmentAt = now;
        console.warn(
            `🐢 Auto-sticker: latência subiu para média de ${Math.round(recentAverage)} ms; concorrência reduzida para ${autoStickerConcurrency}`
        );
        return;
    }

    if (autoStickerGoodSamples >= 3 &&
        autoStickerJobs.length >= 2 &&
        autoStickerConcurrency < AUTO_STICKER_MAX_CONCURRENCY) {
        autoStickerConcurrency++;
        autoStickerGoodSamples = 0;
        autoStickerSlowSamples = 0;
        autoStickerLastAdjustmentAt = now;
        console.log(
            `🚀 Auto-sticker: latência estável (${Math.round(recentAverage)} ms); concorrência aumentada para ${autoStickerConcurrency}/${AUTO_STICKER_MAX_CONCURRENCY}`
        );
    }
}

function scheduleAutoSticker(sock, msg) {
    const message = msg.message;
    const jid = msg.key?.remoteJid;
    if (!jid?.endsWith("@g.us")) return;
    if (!message?.imageMessage && !message?.videoMessage) return;

    if (
        activeAutoStickerJobs >= autoStickerConcurrency &&
        autoStickerJobs.length >= AUTO_STICKER_QUEUE_LIMIT
    ) {
        console.warn("⚠️ Fila de auto-sticker cheia; mídia ignorada para proteger a memória.");
        return;
    }

    autoStickerJobs.push({ sock, msg });
    drainAutoStickerJobs();
}

function drainAutoStickerJobs() {
    while (
        activeAutoStickerJobs < autoStickerConcurrency &&
        autoStickerJobs.length > 0
    ) {
        const job = autoStickerJobs.shift();
        const startedAt = Date.now();
        const concurrencyAtStart = autoStickerConcurrency;
        let failed = false;
        activeAutoStickerJobs++;

        Promise.resolve()
            .then(() => createAutoSticker(job.sock, job.msg))
            .then(result => {
                if (result === false) failed = true;
            })
            .catch(error => {
                failed = true;
                console.error("❌ Erro auto-sticker:", error);
            })
            .finally(() => {
                adaptAutoStickerConcurrency(Date.now() - startedAt, concurrencyAtStart, failed);
                activeAutoStickerJobs--;
                drainAutoStickerJobs();
            });
    }
}

function isRelevantMessage(msg) {
    const message = msg.message;
    if (!message) return false;

    const text =
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        "";

    // Comandos precisam ser processados em qualquer conversa.
    if (text.trimStart().startsWith(".")) return true;

    // Auto-sticker só atua em mídia de grupos; mensagens comuns não entram na fila.
    const jid = msg.key?.remoteJid;
    return Boolean(
        jid?.endsWith("@g.us") &&
        (message.imageMessage || message.videoMessage)
    );
}

function scheduleMessage(sock, commandHandler, msg) {
    if (!isRelevantMessage(msg)) return;

    incomingMessages.push({ sock, commandHandler, msg });
    drainIncomingMessages();
}

function drainIncomingMessages() {
    while (activeMessageTasks < MESSAGE_CONCURRENCY && incomingMessages.length > 0) {
        const task = incomingMessages.shift();
        activeMessageTasks++;

        Promise.resolve()
            .then(async () => {
                const { sock, commandHandler, msg } = task;
                const jid = msg.key.remoteJid;

                if (jid?.endsWith("@g.us")) {
                    scheduleAutoSticker(sock, msg);
                }

                try {
                    await hidePresence(sock);
                    await commandHandler.handle(msg);
                    await hidePresence(sock);
                } catch (error) {
                    console.error("❌ Erro executando comando:", error);
                }
            })
            .catch(error => {
                console.error("❌ Erro processando mensagem:", error);
            })
            .finally(() => {
                activeMessageTasks--;
                drainIncomingMessages();
            });
    }
}

async function hidePresence(sock) {
    try {
        await sock.sendPresenceUpdate("unavailable");
    } catch (error) {
        console.error("⚠️ Falha ao ocultar presença:", error?.message || error);
    }
}

// Aplica as opções de privacidade da própria conta do bot no WhatsApp.
// Cada opção é isolada para que uma falha não impeça a reconexão nem os comandos.
async function applyWhatsAppPrivacy(sock) {
    const privacyUpdates = [
        ["visto por último", () => sock.updateLastSeenPrivacy?.("none")],
        ["status online", () => sock.updateOnlinePrivacy?.("match_last_seen")],
        ["confirmações de leitura", () => sock.updateReadReceiptsPrivacy?.("none")]
    ];

    for (const [label, update] of privacyUpdates) {
        try {
            await update();
        } catch (error) {
            console.warn(`⚠️ Não foi possível atualizar a privacidade de ${label}.`);
        }
    }
}

async function flushAutoSticker(
    sock,
    jid
) {

    const stickers =
        autoStickerBuffers.get(
            jid
        );

    autoStickerBuffers.delete(
        jid
    );

    autoStickerTimers.delete(
        jid
    );

    if (
        !stickers ||
        stickers.length === 0
    ) {
        return;
    }

    console.log(
        `📦 Auto-sticker: ${stickers.length} sticker(s) aguardando envio em ${jid}`
    );

    try {

        

        if (
            stickers.length === 1
        ) {

            await sock.sendMessage(
                jid,
                {
                    sticker:
                        stickers[0]
                }
            );

            console.log(
                "✅ Sticker individual enviado"
            );

            return;
        }

        

        await sendStickerPack(
            sock,
            jid,
            stickers,
            {
                name:
                    "chiru san bot",

                publisher:
                    "Chiru-san Bot",

                description:
                    "🌸 Chiru-san Bot"
            }
        );

        console.log(
            `✅ Sticker pack enviado com ${stickers.length} sticker(s)`
        );

    } catch (error) {

        console.error(
            "❌ Erro enviando sticker pack:",
            error
        );

        

        console.log(
            "↩️ Enviando stickers individualmente..."
        );

        for (
            const sticker of stickers
        ) {

            try {

                await sock.sendMessage(
                    jid,
                    {
                        sticker
                    }
                );

            } catch (
                stickerError
            ) {

                console.error(
                    "Erro enviando sticker individual:",
                    stickerError
                );
            }
        }
    }
}

async function createAutoSticker(
    sock,
    msg
) {

    const jid =
        msg.key.remoteJid;

    const image =
        msg.message?.imageMessage;

    const video =
        msg.message?.videoMessage;

    if (
        !image &&
        !video
    ) {
        return;
    }

    

    const enabled =
        await isEnabled(
            jid
        );

    if (!enabled) {
        return;
    }

    console.log(
        `🖼️ Auto-sticker ativado em: ${jid}`
    );

    const id =
        randomUUID();

    const type =
        video
            ? "video"
            : "image";

    const ext =
        video
            ? "mp4"
            : "jpg";

    const input =
        `./temp/${id}.${ext}`;

    const output =
        `./temp/${id}.webp`;

    try {

        await fs.mkdir(
            "./temp",
            {
                recursive:
                    true
            }
        );

        

        const media =
            await downloadMedia(
                video ||
                image,
                type
            );

        await fs.writeFile(
            input,
            media
        );

        

        await createSticker(
            input,
            output,
            {
                packname:
                    "chiru san bot",

                author:
                    msg.pushName ||
                    "Usuário"
            },
            type
        );

        

        const sticker =
            await fs.readFile(
                output
            );

        

        if (
            !autoStickerBuffers.has(
                jid
            )
        ) {

            autoStickerBuffers.set(
                jid,
                []
            );
        }

        const queue =
            autoStickerBuffers.get(
                jid
            );

        queue.push(
            sticker
        );

        console.log(
            `📥 Sticker colocado na fila: ${queue.length}`
        );

        

        const oldTimer =
            autoStickerTimers.get(
                jid
            );

        if (
            oldTimer
        ) {

            clearTimeout(
                oldTimer
            );
        }

        const timer =
            setTimeout(
                () => {

                    flushAutoSticker(
                        sock,
                        jid
                    );

                },
                AUTO_STICKER_WAIT
            );

        autoStickerTimers.set(
            jid,
            timer
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Erro auto-sticker:",
            error
        );

        return false;

    } finally {

        

        await fs.unlink(
            input
        ).catch(
            () => {}
        );

        await fs.unlink(
            output
        ).catch(
            () => {}
        );
    }
}

async function startBotInternal() {

    const {
        state,
        saveCreds
    } =
        await useMultiFileAuthState(
            "./auth"
        );

    const {
        version
    } =
        await fetchLatestBaileysVersion();

    const sock =
        makeWASocket({
            auth:
                state,

            version,

            // Baileys não oferece desativação segura desse timeout; 24h evita
            // desconexões por timeout durante inicializações/rede muito lentas.
            connectTimeoutMs: 24 * 60 * 60 * 1000,

            markOnlineOnConnect:
                false,

            logger:
                P({
                    level:
                        "error"
                })
        });

    // Guarda o socket atual para ignorar eventos atrasados de conexões antigas.
    activeSocket = sock;

    const commandHandler =
        new CommandHandler(
            sock
        );

    await commandHandler.loadCommands();

    sock.ev.on(
        "creds.update",
        saveCreds
    );

    

    sock.ev.on(
        "messages.upsert",
        ({ messages }) => {
            for (const msg of messages) {
                if (!msg.message) continue;
                scheduleMessage(sock, commandHandler, msg);
            }
        }
    );

    
    sock.ev.on(
        "connection.update",

        async ({
            connection,
            lastDisconnect
        }) => {

            if (sock !== activeSocket) return;

            if (
                connection ===
                "open"
            ) {

                console.log(
                    "🟢 Bot conectado!"
                );

                // Ajusta a privacidade da conta e força presença offline.
                await applyWhatsAppPrivacy(sock);
                await hidePresence(sock);
            }

            if (
                connection ===
                "close"
            ) {
                // Invalida este socket antes de agendar a próxima tentativa.
                if (sock === activeSocket) activeSocket = null;

                try {

                const status =
                    lastDisconnect
                        ?.error
                        instanceof Boom

                        ? lastDisconnect
                            .error
                            .output
                            .statusCode

                        : 0;

                if (
                    status === DisconnectReason.loggedOut
                ) {
                    console.log(
                        "❌ Sessão encerrada. Faça o pareamento novamente."
                    );
                    return;
                }

                console.log(
                    "🔄 Conexão encerrada; tentando reconectar imediatamente..."
                );

                startBot().catch(error => {
                    console.error("❌ Falha na reconexão imediata:", error);
                });
                } catch (error) {
                    console.error("❌ Erro tratando desconexão:", error);
                }
            }
        }
    );

    

    if (
        !state.creds.registered
    ) {

        rl.question(

            "Digite seu número (ex: 5598999999999): ",

            async numero => {

                try {

                    const codigo =
                        await sock.requestPairingCode(
                            numero
                        );

                    console.log(
                        "\nCódigo:"
                    );

                    console.log(
                        codigo
                    );

                } catch (error) {

                    console.error(
                        "Erro ao gerar código:",
                        error
                    );
                }

                rl.close();
            }
        );
    }
}

// Impede duas inicializações simultâneas, por exemplo se o início e uma
// desconexão acontecerem quase ao mesmo tempo.
async function startBot() {
    if (startPromise) return startPromise;

    startPromise = startBotInternal();

    try {
        return await startPromise;
    } finally {
        startPromise = null;
    }
}

startBot().catch(error => {
    console.error("❌ Falha ao iniciar o bot:", error);
});
