import { randomUUID } from "node:crypto";
import { downloadMedia } from "../../utils/download.js";
import { upscaleImage } from "../../services/upscale.js";

export default {
    name: "upscale2",
    description: "Redimensiona uma imagem para dimensões exatas",

    async execute(sock, msg, args) {
        const jid = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const image = quoted?.imageMessage || msg.message?.imageMessage;

        if (!image) {
            await sock.sendMessage(jid, {
                text: "🖼️ Envie uma foto com `.upscale2 1280x720` ou responda à foto com esse comando."
            });
            return;
        }

        if (!args[0]) {
            await sock.sendMessage(jid, {
                text: "📐 Informe a resolução exata. Exemplo: `.upscale2 1280x720`\nLimite: 1920x1080. A imagem poderá ser esticada ou comprimida."
            });
            return;
        }

        try {
            await sock.sendMessage(jid, {
                text: "📐 Ajustando a imagem para as dimensões exatas..."
            });

            const buffer = await downloadMedia(image, "image");
            const result = await upscaleImage(buffer, args[0], false);

            await sock.sendMessage(jid, {
                image: result,
                mimetype: "image/jpeg",
                caption: `✨ Upscale concluído!\n📐 Dimensões exatas: ${args[0]}\n⚠️ A proporção pode ter sido alterada para corresponder exatamente à resolução.`
            }, { quoted: msg });
        } catch (error) {
            console.error("Erro no comando upscale2:", error?.message || error);
            await sock.sendMessage(jid, {
                text: `❌ Não consegui redimensionar a imagem.\n${error?.message || "Tente novamente com outra imagem."}`
            }, { quoted: msg });
        }
    }
};
