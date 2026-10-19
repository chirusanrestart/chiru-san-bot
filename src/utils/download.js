import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export async function downloadMediaToFile(message, type, filePath) {
    const stream = await downloadContentFromMessage(message, type);
    await mkdir(path.dirname(filePath), { recursive: true });

    try {
        // O stream do Baileys vai direto para o arquivo temporário.
        // Evita acumular chunks e depois duplicá-los com Buffer.concat().
        await pipeline(
            Readable.from(stream),
            createWriteStream(filePath, { flags: "wx" })
        );
        return filePath;
    } catch (error) {
        await unlink(filePath).catch(() => {});
        throw error;
    }
}

// Mantido por compatibilidade com outros comandos que ainda precisam de Buffer.
export async function downloadMedia(message, type) {
    const stream = await downloadContentFromMessage(message, type);
    const chunks = [];
    let totalLength = 0;

    for await (const chunk of stream) {
        chunks.push(chunk);
        totalLength += chunk.length;
    }

    return Buffer.concat(chunks, totalLength);
}
