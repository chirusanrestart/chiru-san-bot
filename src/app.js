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


/*
 * ============================================================
 * CONFIGURAÇÕES
 * ============================================================
 */

const AUTO_STICKER_WAIT =
    2000;


/*
 * ============================================================
 * FILAS DO AUTO-STICKER
 * ============================================================
 *
 * Cada grupo possui sua própria fila.
 */

const autoStickerBuffers =
    new Map();


const autoStickerTimers =
    new Map();


/*
 * ============================================================
 * FUNÇÕES AUXILIARES
 * ============================================================
 */

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


/*
 * ============================================================
 * ENVIA A FILA DO GRUPO
 * ============================================================
 */

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

        /*
         * ====================================================
         * APENAS 1 STICKER
         * ====================================================
         *
         * Mantém o comportamento antigo.
         */

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


        /*
         * ====================================================
         * 2+ STICKERS
         * ====================================================
         *
         * Cria pack nativo.
         *
         * sendStickerPack() automaticamente
         * divide em 60 + 60 + ...
         */

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


        /*
         * ====================================================
         * FALLBACK
         * ====================================================
         *
         * Se o pack falhar, não perdemos as figurinhas.
         * Envia individualmente.
         */

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


/*
 * ============================================================
 * CRIA STICKER AUTOMÁTICO
 * ============================================================
 */

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


    /*
     * Verifica se o recurso está
     * habilitado no grupo.
     */

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


        /*
         * ====================================================
         * DOWNLOAD
         * ====================================================
         */

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


        /*
         * ====================================================
         * CONVERSÃO PARA WEBP
         * ====================================================
         */

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


        /*
         * ====================================================
         * LÊ O WEBP PARA RAM
         * ====================================================
         *
         * Não guardamos o caminho porque o arquivo
         * será apagado no finally.
         */

        const sticker =
            await fs.readFile(
                output
            );


        /*
         * ====================================================
         * CRIA FILA DO GRUPO
         * ====================================================
         */

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


        /*
         * ====================================================
         * REINICIA O TIMER
         * ====================================================
         *
         * Cada nova mídia recebida dentro dos 2 segundos
         * prolonga a fila.
         */

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

        /*
         * Apaga apenas os arquivos temporários.
         * O WebP já está salvo na RAM da fila.
         */

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


/*
 * ============================================================
 * START BOT
 * ============================================================
 */

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


    /*
     * ========================================================
     * MENSAGENS
     * ========================================================
     */

    sock.ev.on(
        "messages.upsert",

        async ({
            messages
        }) => {

            /*
             * Processa todas as mensagens
             * do evento, e não somente messages[0].
             */

            for (
                const msg of messages
            ) {

                if (
                    !msg.message
                ) {
                    continue;
                }


                /*
                 * Permite o menu acessar
                 * os comandos carregados.
                 */

                msg.commandHandler =
                    commandHandler;


                /*
                 * ID do chat.
                 */

                const jid =
                    msg.key.remoteJid;


                /*
                 * Verifica se é grupo.
                 */

                const isGroup =
                    jid?.endsWith(
                        "@g.us"
                    );


                /*
                 * =================================================
                 * AUTO-STICKER
                 * =================================================
                 */

                if (
                    isGroup
                ) {

                    await createAutoSticker(
                        sock,
                        msg
                    );
                }


                /*
                 * =================================================
                 * DELAY HUMANO
                 * =================================================
                 */

                await sleep(
                    randomDelay()
                );


                /*
                 * =================================================
                 * COMANDOS
                 * =================================================
                 */

                await commandHandler.handle(
                    msg
                );
            }
        }
    );


    /*
     * ========================================================
     * CONEXÃO
     * ========================================================
     */

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

                console.log(
                    "🟢 Bot conectado!"
                );
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
                    status !==
                    DisconnectReason.loggedOut
                ) {

                    console.log(
                        "🔄 Reconectando..."
                    );


                    startBot();


                } else {

                    console.log(
                        "❌ Sessão encerrada."
                    );
                }
            }
        }
    );


    /*
     * ========================================================
     * PAIRING CODE
     * ========================================================
     */

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


/*
 * ============================================================
 * INICIA
 * ============================================================
 */

startBot();
