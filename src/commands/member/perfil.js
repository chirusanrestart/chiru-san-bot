export default {
    name: "perfil",
    description: "Gera um perfil aleatório",

    async execute(sock, msg, args) {
        try {
            const context =
                msg.message?.extendedTextMessage?.contextInfo;

            const mentions = context?.mentionedJid || [];

            let nome;

            if (mentions.length >= 1) {
                nome = mentions[0].split("@")[0];
            } else if (args.length > 0) {
                nome = args.join(" ");
            } else {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text: "🎭 Use assim:\n.perfil @pessoa\n\nou\n.perfil nome"
                    },
                    { quoted: msg }
                );
                return;
            }

            // Gera números baseados no nome
            const seed = nome
                .toLowerCase()
                .split("")
                .reduce((acc, char) => acc + char.charCodeAt(0), 0);

            const sorte = seed % 101;
            const inteligencia = (seed * 3) % 101;
            const memeiro = (seed * 7) % 101;
            const energia = (seed * 11) % 101;
            const fofura = (seed * 13) % 101;

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
`🎭 *Perfil de @${nome}*

🍀 Sorte: ${sorte}%
🧠 Inteligência: ${inteligencia}%
😂 Memeiro: ${memeiro}%
⚡ Energia: ${energia}%
💖 Fofura: ${fofura}%

✨ Perfil gerado pelo Chiru Bot`,
                    mentions: mentions.length ? mentions : []
                },
                { quoted: msg }
            );

        } catch (err) {
            console.error("Erro no perfil:", err);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: "❌ Erro ao gerar perfil."
                },
                { quoted: msg }
            );
        }
    }
};
