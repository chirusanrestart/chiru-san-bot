import { getMegapackHistory } from "../../services/megapackHistory.js";

const PAGE_SIZE = 100;
const YIELD_EVERY = 250;

function yieldToEventLoop() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

export default {
    name: "megapacklista",
    aliases: ["listamegapack", "megapacklist"],
    description: "Lista os personagens salvos no catálogo do megapack",
    async execute(sock, msg, args = []) {
        const from = msg.key.remoteJid;
        const requestedPage = Number.parseInt(args[0] || "1", 10);

        if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) {
            return sock.sendMessage(from, {
                text: "📚 Usa assim: *.megapacklista* ou *.megapacklista 2* para ver outra página."
            }, { quoted: msg });
        }

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

        const totalPages = Math.ceil(names.length / PAGE_SIZE);
        if (requestedPage > totalPages) {
            return sock.sendMessage(from, {
                text: `📚 Existem ${names.length} personagens no catálogo, divididos em ${totalPages} páginas. Essa página não existe. Usa *.megapacklista ${totalPages}* para ver a última.`
            }, { quoted: msg });
        }

        const start = (requestedPage - 1) * PAGE_SIZE;
        const pageNames = names.slice(start, start + PAGE_SIZE);
        const lines = [];

        for (let index = 0; index < pageNames.length; index++) {
            lines.push(`${start + index + 1}. ${pageNames[index]}`);
            if ((index + 1) % YIELD_EVERY === 0) await yieldToEventLoop();
        }

        const text = [
            `📚 *CATÁLOGO DO MEGAPACK*`,
            `💖 Personagens únicos: *${names.length}*`,
            `📄 Página *${requestedPage}/${totalPages}* (até ${PAGE_SIZE} nomes por página)`,
            "",
            ...lines,
            "",
            requestedPage < totalPages
                ? `➡️ Próxima página: *.megapacklista ${requestedPage + 1}*`
                : "✅ Esta é a última página."
        ].join("\n");

        await sock.sendMessage(from, { text }, { quoted: msg });
    }
};
