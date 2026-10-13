import { getCharacter } from "../../ai/characters.js";
import { getSelectedCharacter, getConversation, appendTurn } from "../../ai/characterStore.js";
import { generateCharacterReply } from "../../ai/characterProvider.js";

const MAX_INPUT_LENGTH = 1500;

export default {
    name: "falar",
    aliases: ["conversar"],
    description: "Conversa com o personagem selecionado",
    async execute(sock, msg, args) {
        const chatId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;
        const text = args.join(" ").trim();

        if (!text) {
            return sock.sendMessage(chatId, { text: "💬 Escreva uma mensagem: *.falar Oi! Como você está?*" });
        }
        if (text.length > MAX_INPUT_LENGTH) {
            return sock.sendMessage(chatId, { text: `✂️ Sua mensagem ficou grandinha demais. O limite é ${MAX_INPUT_LENGTH} caracteres.` });
        }

        try {
            const selectedId = await getSelectedCharacter(userId, chatId);
            if (!selectedId) {
                return sock.sendMessage(chatId, { text: "🎭 Primeiro escolha alguém com *.personagem NOME*. Veja opções usando *.personagens*." });
            }
            const character = getCharacter(selectedId);
            if (!character) {
                return sock.sendMessage(chatId, { text: "⚠️ A seleção salva não existe mais. Escolha um personagem com *.personagem NOME*." });
            }

            const conversation = await getConversation(userId, chatId, character.id);
            const messages = [
                { role: "system", content: character.systemPrompt },
                ...conversation.history,
                { role: "user", content: text }
            ];
            const answer = await generateCharacterReply(messages);
            await appendTurn(userId, chatId, character.id, conversation.conversationId, text, answer);
            await sock.sendMessage(chatId, { text: `🎭 *${character.name}:*\n\n${answer}` });
        } catch (error) {
            console.error("Erro na conversa com personagem:", error?.message || error);
            const unavailable = error?.code === "AI_NOT_CONFIGURED"
                ? "🌸 A IA está desativada. Configure GROQ_API_KEY no .env e reinicie o bot."
                : "💔 O personagem não conseguiu responder agora. Tente novamente daqui a pouquinho.";
            await sock.sendMessage(chatId, { text: unavailable });
        }
    }
};
