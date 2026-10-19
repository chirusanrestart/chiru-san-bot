import { getMegapackHistory } from "../../services/megapackHistory.js";
import packCommand from "./pack.js";

export default {
    name: "megapack",
    aliases: ["restaurarpack", "packbackup"],
    description: "Recoloca na fila todos os packs já pedidos ao bot",
    async execute(sock, msg) {
        const from = msg.key.remoteJid;
        let packs;

        try {
            packs = await getMegapackHistory();
        } catch (error) {
            console.error("❌ Erro lendo histórico global do megapack:", error);
            return sock.sendMessage(from, {
                text: "❌ Não consegui ler o catálogo de packs agora. Tenta novamente daqui a pouquinho."
            }, { quoted: msg });
        }

        const names = [...new Set(packs.map(item => String(item.name || "").trim()).filter(Boolean))];
        if (!names.length) {
            return sock.sendMessage(from, {
                text: "🌸 Ainda não há packs no catálogo. A partir dos pedidos feitos com *.pack nome do personagem*, o bot vai guardar os nomes automaticamente para todo mundo."
            }, { quoted: msg });
        }

        await sock.sendMessage(from, {
            text: `💖 O catálogo global tem *${names.length}* personagens! Vou colocar todos os packs na fila para você.\n\n${names.map((name, i) => `${i + 1}. ${name}`).join("\n")}\n\n📥 Pode demorar um pouquinho porque cada pack é gerado normalmente.`
        }, { quoted: msg });

        for (const name of names) {
            await packCommand.execute(sock, msg, [name]);
        }
    }
};
