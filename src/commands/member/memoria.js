import {
    getSelectedCharacter,
    getConversation,
    historyLimit
} from "../../ai/characterStore.js";
import { getCharacter } from "../../ai/characters.js";
import { getCharacterLongTermMemory } from "../../ai/characterLongTermMemory.js";

export default {
    name: "memoria",
    aliases: ["memoriabot", "contexto"],
    description: "Mostra o estado da memória do personagem selecionado",
    async execute(sock, msg) {
        const chatId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;

        try {
            const selectedId = await getSelectedCharacter(userId, chatId);
            if (!selectedId) {
                return sock.sendMessage(chatId, {
                    text: "🎭 Você ainda não escolheu um personagem. Use *.personagens* e depois *.personagem NOME*."
                });
            }

            const character = getCharacter(selectedId);
            if (!character) {
                return sock.sendMessage(chatId, {
                    text: "⚠️ O personagem salvo não existe mais. Escolha outro com *.personagem NOME*."
                });
            }

            const conversation = await getConversation(userId, chatId, character.id);
            const history = conversation.history;
            const userMessages = history.filter(item => item.role === "user").length;
            const assistantMessages = history.filter(item => item.role === "assistant").length;

            await sock.sendMessage(chatId, {
                text: [
                    "🧠 *MEMÓRIA DO CHATBOT*",
                    "",
                    `🎭 Personagem: *${character.name}*`,
                    `💬 Mensagens no contexto: *${history.length}/${historyLimit}*`,
                    `🫵 Suas mensagens: *${userMessages}*`,
                    `🤖 Respostas do personagem: *${assistantMessages}*`,
                    "",
                    "💾 O histórico recente fica salvo localmente e continua após reiniciar o bot.",
                    "🔒 Cada personagem tem seu próprio contexto por usuário e chat.",
                    "",
                    "✨ *.novaconversa* começa um contexto vazio.",
                    "🧹 *.novaconversa limpar* apaga seus históricos de personagens."
                ].join("\n")
            });
        } catch (error) {
            console.error("Erro consultando memória do chatbot:", error?.message || error);
            await sock.sendMessage(chatId, {
                text: "💔 Não consegui consultar a memória agora. Tente novamente daqui a pouquinho."
            });
        }
    }
};
