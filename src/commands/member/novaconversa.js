import { getSelectedCharacter } from "../../ai/characterStore.js";
import { getCharacter } from "../../ai/characters.js";
import { startNewConversation, clearUserHistory } from "../../ai/characterStore.js";

export default {
    name: "novaconversa",
    description: "Inicia uma conversa nova ou apaga seu histórico de personagens",
    async execute(sock, msg, args) {
        const chatId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;
        const mode = (args[0] || "").toLocaleLowerCase("pt-BR");

        try {
            if (mode === "limpar") {
                await clearUserHistory(userId);
                return sock.sendMessage(chatId, {
                    text: "🧹 Seu histórico de conversas com personagens foi apagado em todos os chats. Sua seleção de personagem foi mantida."
                });
            }
            if (mode && mode !== "nova") {
                return sock.sendMessage(chatId, { text: "Use *.novaconversa* para começar de novo ou *.novaconversa limpar* para apagar todo seu histórico." });
            }
            const selectedId = await getSelectedCharacter(userId, chatId);
            if (!selectedId || !getCharacter(selectedId)) {
                return sock.sendMessage(chatId, { text: "🎭 Escolha primeiro um personagem com *.personagem NOME*." });
            }
            await startNewConversation(userId, chatId, selectedId);
            await sock.sendMessage(chatId, { text: "✨ Conversa novinha iniciada! O personagem selecionado continua o mesmo, mas não usará o histórico anterior." });
        } catch (error) {
            console.error("Erro iniciando/limpando conversa:", error);
            await sock.sendMessage(chatId, { text: "💔 Não consegui alterar o histórico agora." });
        }
    }
};
