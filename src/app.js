// dotenv é opcional: o bot também funciona com variáveis já definidas no ambiente.
try {
    await import("dotenv/config");
} catch (error) {
    if (
        error?.code === "ERR_MODULE_NOT_FOUND" &&
        /dotenv/.test(error.message || "")
    ) {
        console.log("ℹ️ dotenv não instalado; usando as variáveis de ambiente disponíveis.");
    } else {
        throw error;
    }
}

// Exibe o estado da integração Portkey no terminal sem revelar a chave.
const portkeyConfigured = Boolean(process.env.PORTKEY_API_KEY?.trim());
console.log(
    portkeyConfigured
        ? "🟢 Portkey: chave da API configurada."
        : "⚠️ Portkey: chave da API não configurada (PORTKEY_API_KEY)."
);

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
import { scanHistoricalMessages, resumeHistoricalScan } from "./services/megapackHistory.js";
import { processMedia, isMelissaApiConfigured } from "./services/melissaApi.js";

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

const autoStickerPending =
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

// Concorrência fixa: até 10 conversões simultâneas.
const AUTO_STICKER_CONCURRENCY = 20;
const AUTO_STICKER_QUEUE_LIMIT = 300;
const autoStickerJobs = [];
let activeAutoStickerJobs = 0;

async function scheduleAutoSticker(sock, msg) {
    const message = msg.message;
    const jid = msg.key?.remoteJid;
    if (!jid || (!jid.endsWith("@g.us") && !jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid"))) return;
    if (!message?.imageMessage && !message?.videoMessage) return;

    // Só agenda mídias em conversas onde o recurso foi ativado.
    if (!(await isEnabled(jid))) return;

    if (autoStickerJobs.length >= AUTO_STICKER_QUEUE_LIMIT) {
        console.warn("⚠️ Fila de auto-sticker cheia; mídia ignorada para proteger a memória.");
        return;
    }

    // Uma nova mídia chegou: não deixe o temporizador separar o pack
    // enquanto ainda há conversões desta mesma conversa na fila.
    const oldTimer = autoStickerTimers.get(jid);
    if (oldTimer) {
        clearTimeout(oldTimer);
        autoStickerTimers.delete(jid);
    }

    autoStickerPending.set(jid, (autoStickerPending.get(jid) || 0) + 1);
    autoStickerJobs.push({ sock, msg, jid });
    drainAutoStickerJobs();
}

function scheduleAutoStickerFlush(sock, jid) {
    if ((autoStickerPending.get(jid) || 0) > 0) return;

    const stickers = autoStickerBuffers.get(jid);
    if (!stickers || stickers.length === 0) return;

    const oldTimer = autoStickerTimers.get(jid);
    if (oldTimer) clearTimeout(oldTimer);

    const timer = setTimeout(() => {
        flushAutoSticker(sock, jid).catch(error => {
            console.error("❌ Erro finalizando pack do auto-sticker:", error);
        });
    }, AUTO_STICKER_WAIT);

    autoStickerTimers.set(jid, timer);
}

function drainAutoStickerJobs() {
    while (
        activeAutoStickerJobs < AUTO_STICKER_CONCURRENCY &&
        autoStickerJobs.length > 0
    ) {
        const job = autoStickerJobs.shift();
        activeAutoStickerJobs++;

        Promise.resolve()
            .then(() => createAutoSticker(job.sock, job.msg))
            .catch(error => {
                console.error("❌ Erro auto-sticker:", error);
            })
            .finally(() => {
                activeAutoStickerJobs--;

                const jid = job.jid || job.msg.key?.remoteJid;
                if (jid) {
                    const pending = Math.max(0, (autoStickerPending.get(jid) || 1) - 1);
                    if (pending === 0) {
                        autoStickerPending.delete(jid);
                        scheduleAutoStickerFlush(job.sock, jid);
                    } else {
                        autoStickerPending.set(jid, pending);
                    }
                }

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

    // Mídias podem ativar o auto-sticker tanto em grupos quanto no PV.
    const jid = msg.key?.remoteJid;
    return Boolean(
        (jid?.endsWith("@g.us") || jid?.endsWith("@s.whatsapp.net") || jid?.endsWith("@lid")) &&
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

                if (msg.message?.imageMessage || msg.message?.videoMessage) {
                    scheduleAutoSticker(sock, msg).catch(error => {
                        console.error("❌ Erro agendando auto-sticker:", error);
                    });
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

        // Tenta processar no servidor remoto primeiro; se falhar ou exceder o limite,
        // mantém o conversor local como fallback para não perder o auto-sticker.
        if (isMelissaApiConfigured()) {
            try {
                const remote = await processMedia("sticker", media, {
                    animated: type === "video",
                    packname: "chiru san bot",
                    publisher: msg.pushName || "Usuário"
                });
                const sticker = remote.data;

                if (!autoStickerBuffers.has(jid)) {
                    autoStickerBuffers.set(jid, []);
                }
                const queue = autoStickerBuffers.get(jid);
                queue.push(sticker);
                console.log(`☁️ Auto-sticker processado na nuvem; fila: ${queue.length}`);
                return true;
            } catch (remoteError) {
                console.warn("[Melissa API/auto-sticker] Falhou; usando conversão local:", remoteError.message);
            }
        }

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

        // O pack só é agendado quando todas as mídias já recebidas
        // para este grupo terminarem de converter. O temporizador é
        // controlado pelo scheduler para não dividir uma rajada em figs soltas.
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

    // Registra o evento antes de carregar comandos para reduzir a chance de
    // perder uma sincronização que chegue durante a inicialização.
    sock.ev.on("messaging-history.set", ({ messages, isLatest }) => {
        scanHistoricalMessages(messages, isLatest).catch(error => {
            console.error("❌ Falha na varredura do histórico para o megapack:", error);
        });
    });

    resumeHistoricalScan().catch(error => {
        console.error("❌ Falha retomando a varredura do histórico para o megapack:", error);
    });

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
