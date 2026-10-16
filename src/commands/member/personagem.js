import { findCharacter } from "../../ai/characters.js";
import { setSelectedCharacter } from "../../ai/characterStore.js";
import { resolveCharacterImage } from "../../ai/characterImage.js";

export default {
    name: "personagem",
    description: "Seleciona um personagem e mostra sua imagem de referência, quando disponível",
    async execute(sock, msg, args) {
        const chatId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;
        const query = args.join(" ").trim();

        if (!query) {
            return sock.sendMessage(chatId, {
                text: "🎭 Use *.personagem NOME* ou veja a lista com *.personagens*."
            });
        }

        const character = findCharacter(query);
        if (!character) {
            return sock.sendMessage(chatId, {
                text: "🌸 Não encontrei esse personagem. Use *.personagens* para ver os nomes disponíveis."
            });
        }

        try {
            await setSelectedCharacter(userId, chatId, character.id);
            const caption = `✨ Você escolheu *${character.name}*!\n${character.description}\n\nAgora pode mandar *.falar mensagem* para conversar comigo.`;

            const imageUrl = await resolveCharacterImage(character);
            if (imageUrl) {
                try {
                    await sock.sendMessage(chatId, {
                        image: { url: imageUrl },
                        caption
                    }, { quoted: msg });
                    return;
                } catch (imageError) {
                    console.warn("Não consegui enviar a imagem de referência de", character.name, imageError?.message || imageError);
                }
            }

            await sock.sendMessage(chatId, { text: caption }, { quoted: msg });
        } catch (error) {
            console.error("Erro selecionando personagem:", error);
            await sock.sendMessage(chatId, {
                text: "💔 Não consegui salvar sua seleção. Tente novamente."
            });
        }
    }
};
