import { setGroupEnabled } from "../../services/groupState.js";

export default {
    name: "off",
    description: "Desliga os comandos do bot neste grupo",
    category: "owner",
    ownerOnly: true,

    async execute(sock, msg) {
        const jid = msg.key?.remoteJid;
        const reply = text => sock.sendMessage(jid, { text }, { quoted: msg });

        if (!jid?.endsWith("@g.us")) {
            await reply("📌 Use .off dentro do grupo em que deseja desligar o bot.");
            return;
        }

        try {
            await setGroupEnabled(jid, false);
            await reply("🔴 Bot desligado neste grupo. Só .on, .off e .ban continuam disponíveis.");
        } catch (error) {
            console.error("Falha no comando .off:", error?.message || error);
            await reply("⚠️ Não consegui salvar o estado deste grupo.");
        }
    }
};
