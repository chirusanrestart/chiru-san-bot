import { listCharacters } from "../../ai/characters.js";
import { getSelectedCharacter } from "../../ai/characterStore.js";

const PAGE_SIZE = 15;

export default {
    name: "personagens",
    aliases: ["chatbot", "listachatbot", "listapersonagens"],
    description: "Mostra os personagens disponíveis para conversar no chatbot",
    async execute(sock, msg, args = []) {
        const chatId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;

        try {
            const characters = listCharacters();
            const selected = await getSelectedCharacter(userId, chatId);
            const requestedPage = Number.parseInt(args[0], 10);
            const totalPages = Math.max(1, Math.ceil(characters.length / PAGE_SIZE));
            const page = Number.isFinite(requestedPage)
                ? Math.min(totalPages, Math.max(1, requestedPage))
                : 1;
            const visible = characters.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

            const lines = visible.map((character, index) =>
                `${(page - 1) * PAGE_SIZE + index + 1}. ${selected === character.id ? "👉" : "🌸"} *${character.name}*\n   ${character.description}`
            );

            const text = [
                "🎭 *PERSONAGENS DO CHATBOT*",
                `📚 Disponíveis: *${characters.length}* personagens`,
                "",
                ...lines,
                "",
                `📄 Página *${page}/${totalPages}*`,
                page < totalPages ? `➡️ Próxima página: *.personagens ${page + 1}*` : "",
                page > 1 ? `⬅️ Página anterior: *.personagens ${page - 1}*` : "",
                "",
                "💬 *Como conversar:*",
                "• *.personagem Furina* para escolher",
                "• *.falar Oi, tudo bem?* para mandar mensagem",
                "",
                "✨ Também funciona com *.chatbot* ou *.listachatbot*."
            ].filter(Boolean).join("\n");

            await sock.sendMessage(chatId, { text });
        } catch (error) {
            console.error("Erro listando personagens do chatbot:", error);
            await sock.sendMessage(chatId, {
                text: "💔 Não consegui carregar a lista de personagens agora. Tente novamente daqui a pouquinho."
            });
        }
    }
};
