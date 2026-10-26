import fs from "node:fs";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { webpToImage } from "../../services/ffmpeg.js";
import { processMedia, isMelissaApiConfigured } from "../../services/melissaApi.js";


export default {

    name: "toimg",

    description: "Converte figurinha em imagem",

    async execute(sock, msg) {

        const quoted =
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;


        if (!quoted?.stickerMessage) {

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: "🖼️ Responda uma figurinha usando .toimg"
                }
            );

            return;
        }


        const id = Date.now();


        if (!fs.existsSync("./temp")) {
            fs.mkdirSync("./temp");
        }


        const input =
            `./temp/${id}.webp`;

        const output =
            `./temp/${id}.png`;


        try {

            const stream =
                await downloadContentFromMessage(
                    quoted.stickerMessage,
                    "sticker"
                );


            const chunks = [];


            for await (const chunk of stream) {
                chunks.push(chunk);
            }



            const media = Buffer.concat(chunks);
            if (isMelissaApiConfigured()) {
                try {
                    const remote = await processMedia("toimg", media);
                    await sock.sendMessage(msg.key.remoteJid, { image: remote.data });
                    return;
                } catch (remoteError) {
                    console.warn("[Melissa API/.toimg] Falhou; usando conversão local:", remoteError.message);
                }
            }

            fs.writeFileSync(input, media);


            await webpToImage(
                input,
                output
            );


            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    image: fs.readFileSync(output)
                }
            );


        } catch (error) {

            console.error(
                "Erro no toimg:",
                error
            );


            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: "❌ Deu erro convertendo a figurinha."
                }
            );


        } finally {


            if (fs.existsSync(input)) {
                fs.unlinkSync(input);
            }


            if (fs.existsSync(output)) {
                fs.unlinkSync(output);
            }

        }

    }

};
