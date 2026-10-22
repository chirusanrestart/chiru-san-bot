import { setGroupEnabled } from "../../services/groupState.js";

export default {
    name: "on",
    description: "Liga o bot neste grupo",
    category: "owner",
    ownerOnly: true,

    async execute(sock, msg) {
        const jid = msg.key?.remoteJid;
        const reply = text => sock.sendMessage(jid, { text }, { quoted: msg });

        if (!jid?.endsWith("@g.us")) {
            await reply("📌 Use .on dentro do grupo em que deseja ligar o bot.");
            return;
        }

        try {
            await setGroupEnabled(jid, true);
            await reply("🟢 Bot ligado neste grupo! Os comandos voltaram a funcionar.");
        } catch (error) {
            console.error("Falha no comando .on:", error?.message || error);
            await reply("⚠️ Não consegui salvar o estado deste grupo.");
        }
    }
};
