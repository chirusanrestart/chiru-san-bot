import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import webp from "node-webpmux";
import { downloadMedia } from "../utils/download.js";

function createExif(packname, author, previous = {}) {
    const metadata = {
        ...previous,
        "sticker-pack-id": previous["sticker-pack-id"] || "chiru-san-bot",
        "sticker-pack-name": packname,
        "sticker-pack-publisher": author,
        emojis: Array.isArray(previous.emojis) ? previous.emojis : ["🌸"]
    };

    const json = Buffer.from(JSON.stringify(metadata), "utf-8");
    const header = Buffer.from([
        0x49, 0x49, 0x2a, 0x00,
        0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57,
        0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00,
        0x00, 0x00
    ]);
    const exif = Buffer.concat([header, json]);
    exif.writeUIntLE(json.length, 14, 4);
    return exif;
}

function readExistingMetadata(exif) {
    if (!exif || !exif.length) return {};

    const text = exif.toString("utf8");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return {};

    try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch {
        return {};
    }
}

export async function editStickerMetadata(sock, msg, changes) {
    const jid = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const sticker = quoted?.stickerMessage || msg.message?.stickerMessage;

    if (!sticker) {
        await sock.sendMessage(jid, {
            text: "❌ Responda a uma figurinha com o comando para alterar os metadados dela."
        }, { quoted: msg });
        return;
    }

    if (changes.packname !== undefined && !String(changes.packname).trim()) {
        await sock.sendMessage(jid, {
            text: "❌ O nome do pacote não pode ficar vazio."
        }, { quoted: msg });
        return;
    }
    if (changes.author !== undefined && !String(changes.author).trim()) {
        await sock.sendMessage(jid, {
            text: "❌ O autor não pode ficar vazio."
        }, { quoted: msg });
        return;
    }

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chiru-sticker-meta-"));
    const input = path.join(dir, `${randomUUID()}.webp`);
    const output = path.join(dir, `${randomUUID()}.webp`);

    try {
        const media = await downloadMedia(sticker, "sticker");
        await fs.writeFile(input, media);

        const image = new webp.Image();
        await image.load(input);

        const previous = readExistingMetadata(image.exif);
        const packname = changes.packname !== undefined
            ? String(changes.packname).trim()
            : String(previous["sticker-pack-name"] || "chiru san bot").trim();
        const author = changes.author !== undefined
            ? String(changes.author).trim()
            : String(previous["sticker-pack-publisher"] || "Usuário").trim();

        image.exif = createExif(packname, author, previous);
        await image.save(output);

        const result = await fs.readFile(output);
        await sock.sendMessage(jid, { sticker: result }, { quoted: msg });
    } catch (error) {
        console.error("Erro ao editar metadados da figurinha:", error);
        await sock.sendMessage(jid, {
            text: "💔 Não consegui alterar os metadados dessa figurinha. Tenta com outra figurinha WebP."
        }, { quoted: msg });
    } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}
