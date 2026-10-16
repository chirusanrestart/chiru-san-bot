import { editStickerPackMetadata } from "../../services/stickerPackMetadata.js";

export default {
    name: "autorpack",
    description: "Altera apenas o autor de um pacote de figurinhas",
    async execute(sock, msg, args) {
        const publisher = (args || []).join(" ").trim();
        if (!publisher) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: "✍️ Responda a um pacote de figurinhas com *.autorpack Nome do autor*."
            }, { quoted: msg });
            return;
        }
        await editStickerPackMetadata(sock, msg, { publisher });
    }
};
