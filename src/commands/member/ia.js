import { askAI } from "../../ai/groq.js";

export default {
    name: "ia",

    description: "Conversa com a Chiru-san",

    async execute(sock, msg, args) {
        try {
            const pergunta = args.join(" ");

            if (!pergunta) {
                return await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text: "🌸 Escreve alguma coisa pra Chiru-san responder~"
                    }
                );
            }

            const resposta = await askAI(
                msg.key.remoteJid,
                pergunta
            );

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: resposta
                }
            );

        } catch (error) {
            console.error("Erro na IA:", error);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: "💔 A Chiru-san deu um bugzinho no cérebro..."
                }
            );
        }
    }
};
