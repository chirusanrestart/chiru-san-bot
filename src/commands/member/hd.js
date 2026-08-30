import { downloadMedia } from "../../utils/download.js";
import { runFFmpegHD } from "../../services/ffmpeg.js";

import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";


export default {

    name: "hd",

    description:
        "Realça as cores, contraste e nitidez da imagem",


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


        if (!image) {

            await sock.sendMessage(
                jid,
                {
                    text:
                        "❌ Envie ou responda uma imagem com .hd"
                }
            );

            return;
        }


        await sock.sendMessage(
            jid,
            {
                text:
                    "🌈✨ Deixando a imagem bem vivinha..."
            }
        );


        const id =
            randomUUID();


        const input =
            `./temp/${id}.jpg`;


        const output =
            `./temp/${id}_hd.jpg`;


        try {

            await fs.mkdir(
                "./temp",
                {
                    recursive: true
                }
            );


            const media =
                await downloadMedia(
                    image,
                    "image"
                );


            await fs.writeFile(
                input,
                media
            );


            await runFFmpegHD(
                input,
                output
            );


            const result =
                await fs.readFile(
                    output
                );


            await sock.sendMessage(
                jid,
                {
                    image: result,

                    caption:
                        "🌈✨ HD • cores realçadas"
                }
            );


        } catch (error) {

            console.error(
                "Erro HD:",
                error
            );


            await sock.sendMessage(
                jid,
                {
                    text:
                        "❌ Erro ao processar a imagem."
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
