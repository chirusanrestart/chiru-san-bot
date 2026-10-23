import { askAI } from "../../ai/groq.js";

export default {
    name: "ia3",
    description: "Conversa com a Chiru-san em modo de pesquisa aprofundada",

    async execute(sock, msg, args) {
        const jid = msg.key.remoteJid;
        const pergunta = args.join(" ").trim();

        if (!pergunta) {
            await sock.sendMessage(jid, {
                text: "🔎 Manda tua pergunta pra Chiru-san investigar com mais profundidade~\nExemplo: .ia3 compara as habilidades e a história de dois personagens"
            });
            return;
        }

        try {
            const resposta = await askAI(jid, pergunta, {
                detailed: true,
                researchLevel: 3
            });

            await sock.sendMessage(jid, {
                text: resposta
            });
        } catch (error) {
            console.error("Erro na IA de pesquisa aprofundada:", error);

            await sock.sendMessage(jid, {
                text: "💔 A Chiru-san se enrolou na investigação... tenta de novo daqui a pouquinho!"
            });
        }
    }
};
