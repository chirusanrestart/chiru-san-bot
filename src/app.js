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
import { isEnabled } from "./services/autoSticker.js";
import { downloadMedia } from "./utils/download.js";
import { createSticker } from "./services/sticker.js";


const rl =
    readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });


// Aguarda um determinado tempo

const sleep =
    ms =>
        new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );


// Retorna um atraso aleatório entre 500 e 700 ms

const randomDelay =
    () =>
        Math.floor(
            Math.random() * 201
        ) + 500;


// Cria uma figurinha automaticamente

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


    if (!image && !video)
        return;


    // Verifica se o auto-sticker
    // está ativado neste grupo

    const enabled =
        await isEnabled(
            jid
        );


    if (!enabled)
        return;


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
                recursive: true
            }
        );


        const media =
            await downloadMedia(
                video || image,
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


        await sock.sendMessage(
            jid,
            {
                sticker
            }
        );


    } catch (error) {

        console.error(
            "Erro auto-sticker:",
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

            version,

            auth:
                state,

            logger:
                P({
                    level:
                        "silent"
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

            const msg =
                messages[0];


            if (!msg.message)
                return;


            // Permite o menu acessar
            // os comandos carregados

            msg.commandHandler =
                commandHandler;


            // ID do chat

            const jid =
                msg.key.remoteJid;


            // Verifica se é grupo

            const isGroup =
                jid?.endsWith(
                    "@g.us"
                );


            // Auto-sticker
            // somente em grupos

            if (isGroup) {

                await createAutoSticker(
                    sock,
                    msg
                );

            }


            // Simula um tempo
            // de resposta humano

            await sleep(
                randomDelay()
            );


            // Processa comandos

            await commandHandler.handle(
                msg
            );

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

                console.log(
                    "🟢 Bot conectado!"
                );

            }


            if (
                connection ===
                "close"
            ) {

                const status =
                    lastDisconnect?.error
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


    if (
        !state.creds.registered
    ) {

        rl.question(

            "Digite seu número (ex: 5598999999999): ",

            async numero => {

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


                rl.close();

            }

        );

    }

}


startBot();
