

import { downloadMedia } from "../../utils/download.js";
import { createSticker } from "../../services/sticker.js";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";


export default {

    name: "sticker",

    description: "Cria uma figurinha",


    async execute(sock, msg) {

        const jid =
            msg.key.remoteJid;


        const quoted =
            msg.message?.extendedTextMessage
                ?.contextInfo
                ?.quotedMessage;


        const image =
            quoted?.imageMessage ||
            msg.message?.imageMessage;


        const video =
            quoted?.videoMessage ||
            msg.message?.videoMessage;



        if (!image && !video) {

            await sock.sendMessage(
                jid,
                {
                    text:
                    "❌ Envie uma imagem ou vídeo com .sticker"
                }
            );

            return;

        }



        await sock.sendMessage(
            jid,
            {
                text:
                "🖼️ Criando figurinha..."
            }
        );



        const id =
            randomUUID();



        const type =
            video ? "video" : "image";


        const ext =
            video ? "mp4" : "jpg";


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



        } catch(error) {


            console.error(
                "Erro sticker:",
                error
            );


            await sock.sendMessage(
                jid,
                {
                    text:
                    "❌ Erro ao criar figurinha"
                }
            );


        } finally {


            await fs.unlink(input)
                .catch(() => {});


            await fs.unlink(output)
                .catch(() => {});

        }

    }

};
