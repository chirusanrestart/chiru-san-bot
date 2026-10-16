import { editStickerPackMetadata } from "../../services/stickerPackMetadata.js";

export default {
    name: "metapack",
    description: "Altera o nome e o autor de um pacote de figurinhas",
    async execute(sock, msg, args) {
        const value = (args || []).join(" ").trim();
        const separator = value.indexOf("|");
        if (separator < 1 || separator === value.length - 1) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: "🪄 Responda a um pacote de figurinhas com:\n*.metapack Novo nome | Novo autor*"
            }, { quoted: msg });
            return;
        }

        const name = value.slice(0, separator).trim();
        const publisher = value.slice(separator + 1).trim();
        if (!name || !publisher) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: "❌ Informe o nome e o autor. Exemplo: *.metapack Chiru Pack | Melissa*"
            }, { quoted: msg });
            return;
        }

        await editStickerPackMetadata(sock, msg, { name, publisher });
    }
};
