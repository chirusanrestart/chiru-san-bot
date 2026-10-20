import {
    enable,
    disable,
    isEnabled
} from "../../services/autoSticker.js";

export default {
    name: "autostickerpv",
    description: "Ativa ou desativa o auto-sticker na conversa privada",

    async execute(sock, msg, args) {
        const jid = msg.key?.remoteJid;

        if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") {
            await sock.sendMessage(jid, {
                text: "💗 Este comando deve ser usado no privado com o bot."
            });
            return;
        }

        const action = args[0]?.toLowerCase();

        if (action === "on" || action === "ativar") {
            await enable(jid);
            await sock.sendMessage(jid, {
                text: "🟢 Auto-sticker ativado neste PV! Envie imagens ou vídeos e eu transformo em figurinhas automaticamente. 💗\n\nPara desativar: .autostickerpv off"
            });
            return;
        }

        if (action === "off" || action === "desativar") {
            await disable(jid);
            await sock.sendMessage(jid, {
                text: "🔴 Auto-sticker desativado neste PV."
            });
            return;
        }

        const enabled = await isEnabled(jid);
        await sock.sendMessage(jid, {
            text: `⚙️ Auto-sticker no PV: ${enabled ? "🟢 ativado" : "🔴 desativado"}\n\nUse:\n.autostickerpv on\n.autostickerpv off`
        });
    }
};
