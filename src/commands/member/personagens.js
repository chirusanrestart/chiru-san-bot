import { listCharacters } from "../../ai/characters.js";
import { getSelectedCharacter } from "../../ai/characterStore.js";

export default {
    name: "personagens",
    description: "Lista os personagens de conversa disponíveis",
    async execute(sock, msg) {
        const chatId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;
        try {
            const selected = await getSelectedCharacter(userId, chatId);
            const lines = listCharacters().map(character =>
                `${selected === character.id ? "👉" : "🌸"} *${character.name}*\n   ${character.description}\n   ID: ${character.id}`
            );
            await sock.sendMessage(chatId, {
                text: `🎭 *Personagens disponíveis*\n\n${lines.join("\n\n")}\n\nUse *.personagem NOME* para escolher e *.falar mensagem* para conversar.`
            });
        } catch (error) {
            console.error("Erro listando personagens:", error);
            await sock.sendMessage(chatId, { text: "💔 Não consegui carregar os personagens agora." });
        }
    }
};
