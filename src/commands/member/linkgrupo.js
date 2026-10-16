export default {
    name: "linkgrupo",
    aliases: ["linkgroup", "convite"],
    description: "Mostra o link de convite do grupo atual",

    async execute(sock, msg) {
        const jid = msg.key?.remoteJid;
        if (!jid) return;

        const reply = async text => sock.sendMessage(jid, { text }, { quoted: msg });

        if (!jid.endsWith("@g.us")) {
            await reply("❌ Este comando só funciona dentro de um grupo.");
            return;
        }

        try {
            const code = await sock.groupInviteCode(jid);
            if (!code) {
                await reply("⚠️ O WhatsApp não retornou um código de convite para este grupo.");
                return;
            }

            await reply(`🔗 *Link de convite do grupo*\n\nhttps://chat.whatsapp.com/${code}\n\n_Compartilhe com cuidado: qualquer pessoa com o link pode tentar entrar._`);
        } catch (error) {
            console.error("Falha ao obter convite do grupo:", error?.message || error);
            await reply("❌ Não consegui obter o link. Verifique se o bot ainda tem acesso ao grupo e tente novamente.");
        }
    }
};
