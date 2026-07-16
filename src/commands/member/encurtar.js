import axios from "axios";

export default {
    name: "encurtar",
    description: "Encurta links usando is.gd",

    async execute(sock, msg, args) {
        try {
            const url = args[0];

            if (!url) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text: "🔗 Use assim:\n.encurtar https://exemplo.com"
                    },
                    { quoted: msg }
                );
                return;
            }

            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text: "❌ Esse link parece inválido.\nUse um link começando com http:// ou https://"
                    },
                    { quoted: msg }
                );
                return;
            }

            const response = await axios.get(
                "https://is.gd/create.php",
                {
                    params: {
                        format: "simple",
                        url: url
                    }
                }
            );

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: `🔗 Link encurtado com sucesso!\n\n✨ ${response.data}`
                },
                { quoted: msg }
            );

        } catch (err) {
            console.error("Erro no encurtar:", err.message);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: "❌ Não consegui encurtar esse link agora."
                },
                { quoted: msg }
            );
        }
    }
};
