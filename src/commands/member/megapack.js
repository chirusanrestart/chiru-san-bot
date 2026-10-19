import { getMegapackHistory } from "../../services/megapackHistory.js";
import packCommand from "./pack.js";

export default {
    name: "megapack",
    aliases: ["restaurarpack", "packbackup"],
    description: "Recoloca na fila os packs de personagens já pedidos por você",
    async execute(sock, msg) {
        const from = msg.key.remoteJid;
        const ownerJid = msg.key.participant || from;

        let packs;
        try {
            packs = await getMegapackHistory(ownerJid);
        } catch (error) {
            console.error("❌ Erro lendo histórico do megapack:", error);
            return sock.sendMessage(from, {
                text: "❌ Não consegui ler o histórico de packs agora. Tenta novamente daqui a pouquinho."
            }, { quoted: msg });
        }

        if (!packs.length) {
            return sock.sendMessage(from, {
                text: "🌸 Ainda não encontrei packs salvos para você. A partir dos próximos pedidos com *.pack nome do personagem*, vou guardar o histórico automaticamente."
            }, { quoted: msg });
        }

        const names = [...new Set(packs.map(item => String(item.name || "").trim()).filter(Boolean))];
        await sock.sendMessage(from, {
            text: `💖 Encontrei *${names.length}* personagens no seu histórico! Vou colocar todos os packs na fila. Isso pode levar um tempinho, pois cada pack é processado normalmente.\n\n${names.map((name, i) => `${i + 1}. ${name}`).join("\n")}`
        }, { quoted: msg });

        // Reutiliza o comando .pack e sua fila original, sem duplicar a lógica
        // de busca, conversão e envio de figurinhas.
        for (const name of names) {
            await packCommand.execute(sock, msg, [name]);
        }
    }
};
