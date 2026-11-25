import {
    isWelcomeEnabled,
    setWelcomeEnabled
} from "../../services/groupWelcome.js";

function normalizeJid(value) {
    return String(value || "").split(":")[0];
}

async function isGroupAdmin(sock, jid, sender) {
    const metadata = await sock.groupMetadata(jid);
    const senderJid = normalizeJid(sender);
    return (metadata.participants || []).some(participant =>
        normalizeJid(participant.id) === senderJid &&
        (participant.admin === "admin" || participant.admin === "superadmin")
    );
}

export default {
    name: "bemvindo",
    aliases: ["boasvindas", "welcome"],
    category: "admin",
    description: "Ativa ou desativa as boas-vindas do grupo",

    async execute(sock, msg, args = []) {
        const jid = msg.key?.remoteJid;
        const sender = msg.key?.participant || msg.key?.remoteJid;

        if (!jid?.endsWith("@g.us")) {
            await sock.sendMessage(jid, {
                text: "🌸 Esse comando só funciona em grupos."
            }, { quoted: msg });
            return;
        }

        try {
            if (!(await isGroupAdmin(sock, jid, sender))) {
                await sock.sendMessage(jid, {
                    text: "⛔ Apenas administradores do grupo podem configurar as boas-vindas."
                }, { quoted: msg });
                return;
            }

            const action = String(args[0] || "status").toLowerCase();

            if (["on", "ativar", "ligar"].includes(action)) {
                await setWelcomeEnabled(jid, true);
                await sock.sendMessage(jid, {
                    text: "╭━━━〔 🌸 BOAS-VINDAS 〕━━━╮\n│\n│ 💗 As boas-vindas foram ativadas!\n│ ✨ Cada nova pessoa será recebida por aqui.\n│\n╰━━━━━━━━━━━━━━━━━━━━━━╯"
                }, { quoted: msg });
                return;
            }

            if (["off", "desativar", "desligar"].includes(action)) {
                await setWelcomeEnabled(jid, false);
                await sock.sendMessage(jid, {
                    text: "╭━━━〔 🌸 BOAS-VINDAS 〕━━━╮\n│\n│ 🔕 As boas-vindas foram desativadas.\n│\n╰━━━━━━━━━━━━━━━━━━━━━━╯"
                }, { quoted: msg });
                return;
            }

            if (!["status", "estado"].includes(action)) {
                await sock.sendMessage(jid, {
                    text: "🌷 Use:\n.bemvindo on\n.bemvindo off\n.bemvindo"
                }, { quoted: msg });
                return;
            }

            const enabled = await isWelcomeEnabled(jid);
            await sock.sendMessage(jid, {
                text: enabled
                    ? "🌸 As boas-vindas estão *ATIVADAS* neste grupo.\nUse .bemvindo off para desativar."
                    : "🔕 As boas-vindas estão *DESATIVADAS* neste grupo.\nUse .bemvindo on para ativar."
            }, { quoted: msg });
        } catch (error) {
            console.error("[bemvindo] Falha ao configurar:", error);
            await sock.sendMessage(jid, {
                text: "❌ Não consegui atualizar as boas-vindas. Tente novamente."
            }, { quoted: msg });
        }
    }
};
