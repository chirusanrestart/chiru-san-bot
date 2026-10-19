import { getMegapackHistory } from "../../services/megapackHistory.js";

const YIELD_EVERY = 250;

function yieldToEventLoop() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

export default {
    name: "megapacklista",
    aliases: ["listamegapack", "megapacklist"],
    description: "Lista todos os personagens salvos no catálogo do megapack",
    async execute(sock, msg) {
        const from = msg.key.remoteJid;

        let packs;
        try {
            packs = await getMegapackHistory();
        } catch (error) {
            console.error("❌ Erro lendo catálogo do megapack:", error);
            return sock.sendMessage(from, {
                text: "❌ Não consegui ler a lista do megapack agora. Tenta novamente daqui a pouquinho."
            }, { quoted: msg });
        }

        // Deduplica em blocos e cede o event loop para o bot continuar atendendo.
        const unique = new Map();
        for (let index = 0; index < packs.length; index++) {
            const name = String(packs[index]?.name || "").trim();
            if (name) {
                const key = name.toLocaleLowerCase("pt-BR");
                if (!unique.has(key)) unique.set(key, name);
            }

            if ((index + 1) % YIELD_EVERY === 0) {
                await yieldToEventLoop();
            }
        }

        const names = [...unique.values()];
        names.sort((a, b) => a.localeCompare(b, "pt-BR"));

        if (!names.length) {
            return sock.sendMessage(from, {
                text: "🌸 O catálogo do megapack ainda está vazio. Os nomes vão sendo salvos quando alguém usa *.pack nome do personagem* e quando a varredura encontra comandos antigos."
            }, { quoted: msg });
        }

        // Monta a lista inteira numa única mensagem, cedendo o event loop durante a montagem.
        const lines = [];
        for (let index = 0; index < names.length; index++) {
            lines.push(`${index + 1}. ${names[index]}`);
            if ((index + 1) % YIELD_EVERY === 0) {
                await yieldToEventLoop();
            }
        }

        const text = [
            "📚 *CATÁLOGO COMPLETO DO MEGAPACK*",
            `💖 Personagens únicos: *${names.length}*`,
            "",
            ...lines
        ].join("\n");

        try {
            await sock.sendMessage(from, { text }, { quoted: msg });
        } catch (error) {
            console.error("❌ Erro enviando catálogo completo do megapack:", error);
            await sock.sendMessage(from, {
                text: `❌ Não consegui enviar a lista completa em uma única mensagem. O catálogo tem ${names.length} personagens e a mensagem pode ter ultrapassado o limite aceito pelo WhatsApp.`
            }, { quoted: msg });
        }
    }
};
