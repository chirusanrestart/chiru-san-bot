import { downloadContentFromMessage } from "@whiskeysockets/baileys";

export async function downloadMedia(message, type) {

    const stream = await downloadContentFromMessage(
        message,
        type
    );

    let buffer = Buffer.from([]);

    for await (const chunk of stream) {
        buffer = Buffer.concat([
            buffer,
            chunk
        ]);
    }

    return buffer;
}
