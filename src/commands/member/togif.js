import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { downloadMediaToFile } from "../../utils/download.js";
import { convertVideoToGifPlayback } from "../../services/gif.js";

const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const TEMP_DIRECTORY = "./temp";

function getVideoMessage(msg) {
    const currentVideo = msg.message?.videoMessage;
    const quotedVideo = msg.message?.extendedTextMessage
        ?.contextInfo?.quotedMessage?.videoMessage;

    return quotedVideo || currentVideo || null;
}

function getDuration(args = []) {
    if (args.length > 1) return null;
    if (!args[0]) return 6;

    const duration = Number(args[0]);
    return Number.isInteger(duration) && duration >= 1 && duration <= 6
        ? duration
        : null;
}

export default {
    name: "togif",
    description: "Converte um vídeo em GIF",

    async execute(sock, msg, args = []) {
        const jid = msg.key?.remoteJid;
        if (!jid) return;

        const videoMessage = getVideoMessage(msg);
        if (!videoMessage) {
            await sock.sendMessage(jid, {
                text: "🎞️ Envie um vídeo com .togif na legenda ou responda a um vídeo com .togif.\nExemplo: .togif 4"
            }, { quoted: msg });
            return;
        }

        const duration = getDuration(args);
        if (duration === null) {
            await sock.sendMessage(jid, {
                text: "⏱️ Informe uma duração inteira entre 1 e 6 segundos.\nExemplos: .togif ou .togif 4"
            }, { quoted: msg });
            return;
        }

        const declaredSize = Number(videoMessage.fileLength || 0);
        if (Number.isFinite(declaredSize) && declaredSize > MAX_INPUT_BYTES) {
            await sock.sendMessage(jid, {
                text: "❌ Esse vídeo ultrapassa o limite de 64 MiB."
            }, { quoted: msg });
            return;
        }

        const id = randomUUID();
        const input = `${TEMP_DIRECTORY}/${id}.mp4`;
        const output = `${TEMP_DIRECTORY}/${id}-gif.mp4`;

        try {
            await fs.mkdir(TEMP_DIRECTORY, { recursive: true });
            await sock.sendMessage(jid, {
                text: `🎞️ Convertendo os primeiros ${duration} segundos em GIF...`
            }, { quoted: msg });

            await downloadMediaToFile(videoMessage, "video", input);

            const inputInfo = await fs.stat(input);
            if (inputInfo.size > MAX_INPUT_BYTES) {
                const error = new Error("O vídeo ultrapassa o limite de 64 MiB.");
                error.code = "TOGIF_FILE_TOO_LARGE";
                throw error;
            }

            await convertVideoToGifPlayback(input, output, { duration });

            await sock.sendMessage(jid, {
                video: { url: output },
                mimetype: "video/mp4",
                gifPlayback: true,
                caption: "✨ GIF pronto!"
            }, { quoted: msg });
        } catch (error) {
            console.error("[.togif] Falha:", error?.stderr || error?.message || error);

            await sock.sendMessage(jid, {
                text: error?.code === "TOGIF_FILE_TOO_LARGE"
                    ? "❌ Esse vídeo ultrapassa o limite de 64 MiB."
                    : "❌ Não consegui converter esse vídeo. Confira se o FFmpeg está instalado e tente novamente."
            }, { quoted: msg });
        } finally {
            await Promise.all([
                fs.unlink(input).catch(() => {}),
                fs.unlink(output).catch(() => {})
            ]);
        }
    }
};
