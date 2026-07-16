export default {
    name: "ship",
    description: "Calcula compatibilidade entre pessoas",

    async execute(sock, msg, args) {
        try {
            const context =
                msg.message?.extendedTextMessage?.contextInfo;

            const mentions = context?.mentionedJid || [];

            let nome1;
            let nome2;

            if (mentions.length >= 2) {
                nome1 = mentions[0].split("@")[0];
                nome2 = mentions[1].split("@")[0];
            } else if (args.length >= 2) {
                nome1 = args[0];
                nome2 = args.slice(1).join(" ");
            } else {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text: "💘 Use assim:\n.ship Nome1 Nome2\n\nOu marque duas pessoas:\n.ship @pessoa1 @pessoa2"
                    },
                    { quoted: msg }
                );
                return;
            }

            const base = (nome1 + nome2)
                .toLowerCase()
                .split("")
                .reduce((acc, char) => acc + char.charCodeAt(0), 0);

            const porcentagem = base % 101;

            let frase;

            if (porcentagem >= 90) {
                frase = "🌹 Casal lendário! O destino aprovou.";
            } else if (porcentagem >= 70) {
                frase = "💕 Tem bastante química!";
            } else if (porcentagem >= 40) {
                frase = "🌸 Pode dar certo, quem sabe?";
            } else {
                frase = "😂 O destino colocou uma barreira.";
            }

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
`💘 *Ship calculado!*

👤 @${nome1}
💙
👤 @${nome2}

❤️ Compatibilidade: *${porcentagem}%*

${frase}`,
                    mentions: mentions.length >= 2 ? mentions : []
                },
                { quoted: msg }
            );

        } catch (err) {
            console.error("Erro no ship:", err);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: "❌ Erro ao calcular o ship."
                },
                { quoted: msg }
            );
        }
    }
};
