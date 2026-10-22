function normalizePhoneJid(value) {
    if (typeof value !== "string") return "";
    const jid = value.trim().split(":")[0];
    if (!jid.endsWith("@s.whatsapp.net")) return "";
    return jid.slice(0, -"@s.whatsapp.net".length).replace(/\D/g, "");
}

export async function isOwnerMessage(msg) {
    const configuredOwner = String(process.env.OWNER_NUMBER || "").replace(/\D/g, "");
    if (!configuredOwner) return false;

    const key = msg?.key || {};
    // Em grupos com identificadores LID, usa o JID alternativo de número quando o Baileys o fornece.
    const candidates = [
        key.participantAlt,
        key.remoteJidAlt,
        key.participant,
        key.remoteJid
    ];

    return candidates.some(candidate => {
        const phone = normalizePhoneJid(candidate);
        return phone !== "" && phone === configuredOwner;
    });
}
