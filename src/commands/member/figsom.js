import { downloadMediaToFile } from "../../utils/download.js";
import { createSticker } from "../../services/sticker.js";
import {
    extractStickerAudio,
    sendStickerWithAudio
} from "../../services/stickerAudio.js";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

export default {
    name: "figsom",

    description: "Cria uma figurinha animada com o som do vídeo",

    async execute(sock, msg) {
        const jid = msg.key.remoteJid;

        const quoted =
            msg.message?.extendedTextMessage
                ?.contextInfo
                ?.quotedMessage;

        const video =
            quoted?.videoMessage ||
            msg.message?.videoMessage;

        if (!video) {
            await sock.sendMessage(
                jid,
                {
                    text: "❌ Envie ou responda um vídeo com .figsom"
                }
            );

            return;
        }

        await sock.sendMessage(
            jid,
            {
                text: "🎵 Criando figurinha com som..."
            }
        );

        const id = randomUUID();
        const input = "./temp/" + id + ".mp4";
        const stickerOutput = "./temp/" + id + ".webp";
        const audioOutput = "./temp/" + id + ".ogg";

        try {
            await fs.mkdir("./temp", { recursive: true });

            await downloadMediaToFile(
                video,
                "video",
                input
            );

            await createSticker(
                input,
                stickerOutput,
                {
                    packname: "Chiru-san-bot",
                    author: "Chiru-san-bot"
                },
                "video"
            );

            await extractStickerAudio(
                input,
                audioOutput,
                5
            );

            const sticker = await fs.readFile(stickerOutput);
            const audio = await fs.readFile(audioOutput);

            await sendStickerWithAudio(
                sock,
                jid,
                sticker,
                audio
            );

        } catch (error) {
            console.error("Erro figsom:", error);

            await sock.sendMessage(
                jid,
                {
                    text: "❌ Não consegui criar a figurinha com som."
                }
            );

        } finally {
            await fs.unlink(input).catch(() => {});
            await fs.unlink(stickerOutput).catch(() => {});
            await fs.unlink(audioOutput).catch(() => {});
        }
    }
};
