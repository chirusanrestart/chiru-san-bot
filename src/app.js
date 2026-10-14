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

let reconnectTimer = null;
let reconnectAttempts = 0;
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

function scheduleReconnect(delay) {
    // Apenas um temporizador de reconexão pode existir por vez.
    if (reconnectTimer) return;

    const exponentialDelay = Math.min(3000 * (2 ** reconnectAttempts), 30000);
    const safeDelay = Math.min(Math.max(delay ?? 0, exponentialDelay, 3000), 30000);

    console.log(`⏳ Nova tentativa de conexão em ${Math.ceil(safeDelay / 1000)}s...`);

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        reconnectAttempts++;

        try {
            await startBot();
            // Não zerar tentativas aqui: startBot só significa que o socket
            // foi criado. O contador é zerado apenas após "connection: open".
        } catch (error) {
            console.error("❌ Falha ao reconectar:", error);
            scheduleReconnect();
        }
    }, safeDelay);
}

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

// Auto-sticker usa FFmpeg e buffers grandes. Limita jobs simultâneos
// e a espera para que rajadas de mídia não consumam toda a RAM.
const AUTO_STICKER_CONCURRENCY = Math.max(
    1,
    Math.min(2, Number.parseInt(process.env.AUTO_STICKER_CONCURRENCY || "2", 10) || 2)
);
const AUTO_STICKER_QUEUE_LIMIT = 20;
const autoStickerJobs = [];
let activeAutoStickerJobs = 0;

function scheduleAutoSticker(sock, msg) {
    const message = msg.message;
    const jid = msg.key?.remoteJid;
    if (!jid?.endsWith("@g.us")) return;
    if (!message?.imageMessage && !message?.videoMessage) return;

    if (
        activeAutoStickerJobs >= AUTO_STICKER_CONCURRENCY &&
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

    } catch (error) {

        console.error(
            "❌ Erro auto-sticker:",
            error
        );

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

            // Sem timeout artificial de conexão inicial: a biblioteca usa seu padrão.

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

                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
                reconnectAttempts = 0;

                console.log(
                    "🟢 Bot conectado!"
                );

                // Já entra conectado sem marcar online e força presença offline.
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
                    if (reconnectTimer) {
                        clearTimeout(reconnectTimer);
                        reconnectTimer = null;
                    }
                    console.log(
                        "❌ Sessão encerrada. Faça o pareamento novamente."
                    );
                    return;
                }

                console.log(
                    "🔄 Agendando reconexão..."
                );

                scheduleReconnect(3000);
                } catch (error) {
                    console.error("❌ Erro tratando desconexão:", error);
                    scheduleReconnect(5000);
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
    scheduleReconnect(5000);
});
