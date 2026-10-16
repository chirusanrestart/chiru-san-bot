import { proto } from "@whiskeysockets/baileys/WAProto/index.js";
import { generateMessageIDV2 } from "@whiskeysockets/baileys/lib/Utils/generics.js";

export async function editStickerPackMetadata(sock, msg, changes) {
    const jid = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const pack = quoted?.stickerPackMessage || msg.message?.stickerPackMessage;

    if (!pack) {
        await sock.sendMessage(jid, {
            text: "❌ Responda a uma mensagem de pacote de figurinhas com esse comando."
        }, { quoted: msg });
        return;
    }

    const name = changes.name === undefined ? undefined : String(changes.name).trim();
    const publisher = changes.publisher === undefined ? undefined : String(changes.publisher).trim();

    if (name !== undefined && !name) {
        await sock.sendMessage(jid, {
            text: "❌ O nome do pacote não pode ficar vazio."
        }, { quoted: msg });
        return;
    }
    if (publisher !== undefined && !publisher) {
        await sock.sendMessage(jid, {
            text: "❌ O autor não pode ficar vazio."
        }, { quoted: msg });
        return;
    }

    try {
        // Reutiliza os arquivos e as referências de mídia do pack recebido.
        // Só muda os campos de identificação do pacote.
        const updated = proto.Message.StickerPackMessage.fromObject({
            ...pack,
            ...(name !== undefined ? { name } : {}),
            ...(publisher !== undefined ? { publisher } : {})
        });

        await sock.relayMessage(
            jid,
            { stickerPackMessage: updated },
            { messageId: generateMessageIDV2(sock.user?.id) }
        );
    } catch (error) {
        console.error("Erro ao editar metadados do pacote:", error);
        await sock.sendMessage(jid, {
            text: "💔 Não consegui reenviar esse pacote com os metadados alterados."
        }, { quoted: msg });
    }
}
