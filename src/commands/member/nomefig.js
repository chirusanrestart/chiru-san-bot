import { editStickerMetadata } from "../../services/stickerMetadata.js";

export default {
    name: "nomefig",
    aliases: ["nomepack"],
    description: "Altera apenas o nome do pacote de uma figurinha",
    async execute(sock, msg, args) {
        const packname = (args || []).join(" ").trim();
        if (!packname) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: "📦 Responda a uma figurinha com *.nomefig Nome do pacote*."
            }, { quoted: msg });
            return;
        }

        await editStickerMetadata(sock, msg, {
            packname,
            author: undefined
        }).catch(async error => {
            console.error("Erro no comando nomefig:", error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: "💔 Não consegui alterar o nome do pacote dessa figurinha."
            }, { quoted: msg });
        });
    }
};
