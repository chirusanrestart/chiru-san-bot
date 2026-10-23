import { askAI } from "../../ai/groq.js";

export default {
    name: "ia2",
    description: "Conversa com a Chiru-san em modo detalhado",

    async execute(sock, msg, args) {
        const jid = msg.key.remoteJid;
        const pergunta = args.join(" ").trim();

        if (!pergunta) {
            await sock.sendMessage(jid, {
                text: "🌸 Manda tua pergunta pra Chiru-san responder com mais detalhes~\nExemplo: .ia2 explica como funciona uma GPU"
            });
            return;
        }

        try {
            const resposta = await askAI(jid, pergunta, {
                detailed: true,
                researchLevel: 2
            });

            // Mantém a resposta em uma única mensagem; evita fragmentar o contexto
            // e respeita o limite de saída definido no serviço de IA.
            await sock.sendMessage(jid, {
                text: resposta
            });
        } catch (error) {
            console.error("Erro na IA detalhada:", error);

            await sock.sendMessage(jid, {
                text: "💔 A Chiru-san deu um bugzinho no cérebro detalhado... tenta de novo daqui a pouquinho!"
            });
        }
    }
};
