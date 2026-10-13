import { findCharacter } from "../../ai/characters.js";
import { setSelectedCharacter } from "../../ai/characterStore.js";

export default {
    name: "personagem",
    description: "Seleciona o personagem para conversar",
    async execute(sock, msg, args) {
        const chatId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;
        const query = args.join(" ").trim();
        if (!query) {
            return sock.sendMessage(chatId, { text: "🎭 Use *.personagem NOME* ou veja a lista com *.personagens*." });
        }
        const character = findCharacter(query);
        if (!character) {
            return sock.sendMessage(chatId, { text: "🌸 Não encontrei esse personagem. Use *.personagens* para ver os nomes disponíveis." });
        }
        try {
            await setSelectedCharacter(userId, chatId, character.id);
            await sock.sendMessage(chatId, {
                text: `✨ Você escolheu *${character.name}*!\n${character.description}\n\nAgora pode mandar *.falar mensagem* para conversar comigo.`
            });
        } catch (error) {
            console.error("Erro selecionando personagem:", error);
            await sock.sendMessage(chatId, { text: "💔 Não consegui salvar sua seleção. Tente novamente." });
        }
    }
};
