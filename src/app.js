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

function scheduleReconnect(delay = 3000) {
    if (reconnectTimer) return;

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;

        try {
            await startBot();
        } catch (error) {
            console.error("❌ Falha ao reconectar:", error);
            scheduleReconnect(5000);
        }
    }, delay);
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

async function startBot() {

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

            markOnlineOnConnect:
                false,

            logger:
                P({
                    level:
                        "error"
                })
        });

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

        async ({
            messages
        }) => {

            

            for (
                const msg of messages
            ) {

                if (!msg.message) {
                    continue;
                }

                

                msg.commandHandler =
                    commandHandler;

                

                const jid =
                    msg.key.remoteJid;

                

                const isGroup =
                    jid?.endsWith(
                        "@g.us"
                    );

                

                if (
                    isGroup
                ) {
                    // Não bloqueia comandos enquanto o auto-sticker trabalha.
                    createAutoSticker(
                        sock,
                        msg
                    ).catch(error => {
                        console.error("❌ Erro auto-sticker:", error);
                    });
                }

                

                await sleep(
                    randomDelay()
                );

                

                try {
                    await hidePresence(sock);
                    await commandHandler.handle(msg);
                    await hidePresence(sock);
                } catch (error) {
                    console.error(
                        "❌ Erro executando comando:",
                        error
                    );
                }
            }
        }
    );

    

    sock.ev.on(
        "connection.update",

        async ({
            connection,
            lastDisconnect
        }) => {

            if (
                connection ===
                "open"
            ) {

                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }

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
                    "🔄 Agendando reconexão..."
                );

                scheduleReconnect(3000);
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

startBot().catch(error => {
    console.error("❌ Falha ao iniciar o bot:", error);
    scheduleReconnect(5000);
});
