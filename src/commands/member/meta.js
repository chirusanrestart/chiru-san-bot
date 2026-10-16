import { editStickerMetadata } from "../../services/stickerMetadata.js";

export default {
    name: "meta",
    description: "Altera o nome do pacote e o autor de uma figurinha",
    async execute(sock, msg, args) {
        const value = (args || []).join(" ").trim();
        const separator = value.indexOf("|");

        if (separator < 1 || separator === value.length - 1) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: "🪄 Responda a uma figurinha com:\n*.meta Nome do pacote | Nome do autor*"
            }, { quoted: msg });
            return;
        }

        const packname = value.slice(0, separator).trim();
        const author = value.slice(separator + 1).trim();

        if (!packname || !author) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: "❌ Informe o nome do pacote e o autor. Exemplo: *.meta Chiru Pack | Melissa*"
            }, { quoted: msg });
            return;
        }

        await editStickerMetadata(sock, msg, { packname, author }).catch(async error => {
            console.error("Erro no comando meta:", error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: "💔 Não consegui alterar os metadados dessa figurinha."
            }, { quoted: msg });
        });
    }
};
