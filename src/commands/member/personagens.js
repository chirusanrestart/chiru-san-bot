import { listCharacters } from "../../ai/characters.js";
import { getSelectedCharacter } from "../../ai/characterStore.js";

export default {
    name: "personagens",
    aliases: ["chatbot", "listachatbot", "listapersonagens"],
    description: "Mostra todos os personagens disponíveis para conversar no chatbot",
    async execute(sock, msg) {
        const chatId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;

        try {
            const characters = listCharacters();
            const selected = await getSelectedCharacter(userId, chatId);

            const lines = characters.map((character, index) =>
                `${index + 1}. ${selected === character.id ? "👉" : "🌸"} *${character.name}*\n   ${character.description}`
            );

            const text = [
                "🎭 *PERSONAGENS DO CHATBOT*",
                `📚 Disponíveis: *${characters.length}* personagens`,
                "👉 = personagem selecionado",
                "",
                ...lines,
                "",
                "💬 *Como conversar:*",
                "• *.personagem Furina* para escolher",
                "• *.falar Oi, tudo bem?* para mandar mensagem",
                "",
                "✨ Também funciona com *.chatbot* ou *.listachatbot*."
            ].join("\n");

            await sock.sendMessage(chatId, { text });
        } catch (error) {
            console.error("Erro listando personagens do chatbot:", error);
            await sock.sendMessage(chatId, {
                text: "💔 Não consegui carregar a lista de personagens agora. Tente novamente daqui a pouquinho."
            });
        }
    }
};
