import { downloadMedia } from "../../utils/download.js";
import { upscaleImage } from "../../services/upscale.js";

export default {
    name: "upscale",
    description: "Redimensiona uma imagem mantendo a proporção",

    async execute(sock, msg, args) {
        const jid = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const image = quoted?.imageMessage || msg.message?.imageMessage;

        if (!image) {
            await sock.sendMessage(jid, {
                text: "🖼️ Envie uma foto com `.upscale 1280x720` ou responda à foto com esse comando."
            });
            return;
        }

        if (!args[0]) {
            await sock.sendMessage(jid, {
                text: "📐 Informe a resolução desejada. Exemplo: `.upscale 1280x720`\nLimite: 1920x1080."
            });
            return;
        }

        let processingMessage;

        try {
            processingMessage = await sock.sendMessage(jid, {
                text: "🖼️ Redimensionando a imagem sem deformar..."
            });

            const buffer = await downloadMedia(image, "image");
            const result = await upscaleImage(buffer, args[0], true);

            await sock.sendMessage(jid, {
                image: result,
                mimetype: "image/jpeg",
                caption: `✨ Upscale concluído!\n📐 Resolução solicitada: ${args[0]}\n💗 Proporção preservada, sem cortes.`
            }, { quoted: msg });
        } catch (error) {
            console.error("Erro no comando upscale:", error?.message || error);
            await sock.sendMessage(jid, {
                text: `❌ Não consegui redimensionar a imagem.\n${error?.message || "Tente novamente com outra imagem."}`
            }, { quoted: msg });
        } finally {
            if (processingMessage?.key) {
                await sock.sendMessage(jid, {
                    delete: processingMessage.key
                }).catch(() => {});
            }
        }
    }
};
