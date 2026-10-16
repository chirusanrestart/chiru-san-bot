function isAdmin(participant) {
    return participant?.admin === "admin" || participant?.admin === "superadmin";
}

function normalizeJid(jid) {
    if (typeof jid !== "string") return "";
    return jid.trim();
}

export default {
    name: "ban",
    aliases: ["kick", "remover"],
    description: "Remove um membro do grupo (somente administradores)",

    async execute(sock, msg) {
        const jid = msg.key?.remoteJid;
        if (!jid) return;

        const reply = async text => sock.sendMessage(jid, { text }, { quoted: msg });

        if (!jid.endsWith("@g.us")) {
            await reply("❌ Este comando só pode ser usado em grupos.");
            return;
        }

        let metadata;
        try {
            metadata = await sock.groupMetadata(jid);
        } catch (error) {
            console.error("Falha ao consultar grupo no .ban:", error?.message || error);
            await reply("⚠️ Não consegui consultar os participantes deste grupo.");
            return;
        }

        const senderJid = normalizeJid(msg.key.participant);
        const sender = metadata.participants.find(p =>
            normalizeJid(p.id) === senderJid ||
            normalizeJid(p.jid) === senderJid
        );

        if (!isAdmin(sender)) {
            await reply("⛔ Só administradores do grupo podem usar .ban.");
            return;
        }

        const botIds = [
            sock.user?.id,
            sock.user?.lid
        ].filter(Boolean).map(normalizeJid);

        const bot = metadata.participants.find(p =>
            botIds.includes(normalizeJid(p.id)) ||
            botIds.includes(normalizeJid(p.jid)) ||
            botIds.some(id => id && (normalizeJid(p.id).split(":")[0] === id.split(":")[0]))
        );

        if (!isAdmin(bot)) {
            await reply("⚠️ Preciso ser administrador do grupo para remover alguém.");
            return;
        }

        const context = msg.message?.extendedTextMessage?.contextInfo ||
            msg.message?.imageMessage?.contextInfo ||
            msg.message?.videoMessage?.contextInfo ||
            {};
        const mentioned = context.mentionedJid || [];
        const quotedSender = context.participant;
        const targetInput = mentioned[0] || quotedSender || null;

        if (!targetInput) {
            await reply("📌 Marque a pessoa ou responda à mensagem dela com .ban\n\nExemplo: .ban @pessoa");
            return;
        }

        const target = metadata.participants.find(p =>
            normalizeJid(p.id) === normalizeJid(targetInput) ||
            normalizeJid(p.jid) === normalizeJid(targetInput)
        );

        if (!target) {
            await reply("❌ Não encontrei essa pessoa entre os participantes do grupo.");
            return;
        }

        if (isAdmin(target)) {
            await reply("🛡️ Não vou remover um administrador do grupo.");
            return;
        }

        if (
            botIds.includes(normalizeJid(target.id)) ||
            botIds.includes(normalizeJid(target.jid))
        ) {
            await reply("🤖 Não posso remover a mim mesma do grupo!");
            return;
        }

        try {
            await sock.groupParticipantsUpdate(jid, [target.id || target.jid], "remove");
            await reply("✅ Membro removido do grupo.");
        } catch (error) {
            console.error("Falha ao executar .ban:", error?.message || error);
            await reply("❌ Não consegui remover esse membro. Confira se ainda está no grupo e se o bot continua como administrador.");
        }
    }
};
