import { editStickerPackMetadata } from "../../services/stickerPackMetadata.js";

export default {
    name: "nomepack",
    description: "Altera apenas o nome de um pacote de figurinhas",
    async execute(sock, msg, args) {
        const name = (args || []).join(" ").trim();
        if (!name) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: "📦 Responda a um pacote de figurinhas com *.nomepack Novo nome*."
            }, { quoted: msg });
            return;
        }
        await editStickerPackMetadata(sock, msg, { name });
    }
};
