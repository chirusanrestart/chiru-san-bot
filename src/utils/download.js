import { downloadContentFromMessage } from "@whiskeysockets/baileys";

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
