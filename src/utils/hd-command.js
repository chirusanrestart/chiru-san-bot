import { downloadMedia } from "./download.js";
import { runFFmpegHD } from "../services/ffmpeg.js";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

export async function executeHDVariant(sock, msg, variant = "balanced") {
    const jid = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const image = quoted?.imageMessage || msg.message?.imageMessage;
    const profiles = {
        balanced: { label: "HD equilibrado", emoji: "🌈✨", mode: "legacy" },
        anime: { label: "HD Anime", emoji: "🎨", mode: "anime" },
        sharp: { label: "HD Nitidez", emoji: "🔎", mode: "sharp" },
        vivid: { label: "HD Cores", emoji: "🌈", mode: "vivid" },
        natural: { label: "HD Natural", emoji: "📷", mode: "natural" },
        beauty: { label: "HD Beleza", emoji: "✨", mode: "beauty" }
    };
    const profile = profiles[variant] || profiles.balanced;
    if (!image) {
        await sock.sendMessage(jid, { text: "❌ Envie ou responda uma imagem com o comando HD." });
        return;
    }
    await sock.sendMessage(jid, { text: `${profile.emoji} Aplicando ${profile.label} sem exagerar...` });
    const id = randomUUID();
    const input = `./temp/${id}.jpg`;
    const output = `./temp/${id}_hd.jpg`;
    try {
        await fs.mkdir("./temp", { recursive: true });
        const media = await downloadMedia(image, "image");
        await fs.writeFile(input, media);
        await runFFmpegHD(input, output, profile.mode);
        const result = await fs.readFile(output);
        await sock.sendMessage(jid, { image: result, caption: `${profile.emoji} ${profile.label} • imagem realçada` });
    } catch (error) {
        console.error(`Erro ${profile.label}:`, error);
        await sock.sendMessage(jid, { text: "❌ Não consegui processar essa imagem. Tenta outra foto." });
    } finally {
        await fs.unlink(input).catch(() => {});
        await fs.unlink(output).catch(() => {});
    }
}
