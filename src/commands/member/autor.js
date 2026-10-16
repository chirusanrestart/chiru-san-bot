import { editStickerMetadata } from "../../services/stickerMetadata.js";

export default {
    name: "autor",
    description: "Altera apenas o autor de uma figurinha",
    async execute(sock, msg, args) {
        const author = (args || []).join(" ").trim();
        if (!author) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: "✍️ Responda a uma figurinha com *.autor Nome do autor*."
            }, { quoted: msg });
            return;
        }

        await editStickerMetadata(sock, msg, {
            author,
            packname: undefined
        }).catch(async error => {
            console.error("Erro no comando autor:", error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: "💔 Não consegui alterar o autor dessa figurinha."
            }, { quoted: msg });
        });
    }
};
