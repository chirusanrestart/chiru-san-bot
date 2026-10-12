import { downloadContentFromMessage } from "@whiskeysockets/baileys";

export async function downloadMedia(message, type) {
    const stream = await downloadContentFromMessage(message, type);
    const chunks = [];
    let totalLength = 0;

    for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buffer);
        totalLength += buffer.length;
    }

    // Concatenar uma única vez evita copiar repetidamente todo o buffer acumulado.
    return Buffer.concat(chunks, totalLength);
}
