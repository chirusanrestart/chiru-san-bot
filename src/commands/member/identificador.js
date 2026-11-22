export default {
    name: "identificador",
    description: "Mostra o identificador deste grupo",

    async execute(sock, msg) {
        const jid = msg.key?.remoteJid;

        if (!jid?.endsWith("@g.us")) {
            if (jid) {
                await sock.sendMessage(
                    jid,
                    {
                        text: "📌 Use .identificador dentro do grupo cujo identificador deseja consultar."
                    },
                    {
                        quoted: msg
                    }
                );
            }

            return;
        }

        await sock.sendMessage(
            jid,
            {
                text: `🆔 Identificador deste grupo:\n\n${jid}`
            },
            {
                quoted: msg
            }
        );
    }
};
