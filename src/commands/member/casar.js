import {
    buildWeddingCardSvg,
    cleanWeddingName,
    renderWeddingCard
} from "../../services/weddingCard.js";

const MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024;
const PROFILE_PICTURE_TIMEOUT_MS = 7000;
const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
]);

function normalizeJid(value) {
    if (typeof value !== "string") return null;

    const separator = value.lastIndexOf("@");
    if (separator <= 0 || separator === value.length - 1) return null;

    const user = value.slice(0, separator).split(":")[0];
    const server = value.slice(separator + 1);
    if (!user || !server) return null;

    return `${user}@${server}`;
}

export function resolveMarriageParticipants(msg, ownJid) {
    const groupJid = msg.key?.remoteJid;
    if (typeof groupJid !== "string" || !groupJid.endsWith("@g.us")) {
        return { ok: false, reason: "group" };
    }

    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!Array.isArray(mentionedJid) || mentionedJid.length !== 1) {
        return { ok: false, reason: "mention" };
    }

    const senderSource = msg.key?.fromMe
        ? (ownJid || msg.key?.participant)
        : msg.key?.participant;
    const first = normalizeJid(senderSource);
    const second = normalizeJid(mentionedJid[0]);

    if (!first) return { ok: false, reason: "sender" };
    if (!second) return { ok: false, reason: "mention" };
    if (first === second) return { ok: false, reason: "self" };

    return { ok: true, first, second };
}

export function buildMarriageCaption(firstName, firstJid, secondName, secondJid) {
    const safeFirstName = cleanWeddingName(firstName, "Pessoa 1");
    const safeSecondName = cleanWeddingName(secondName, "Pessoa 2");
    const firstNumber = normalizeJid(firstJid)?.split("@")[0];
    const secondNumber = normalizeJid(secondJid)?.split("@")[0];

    return [
        "💍 *CASAMENTO VIRTUAL CELEBRADO!*",
        "",
        `💕 *${safeFirstName}* e *${safeSecondName}* agora estão oficialmente casados!`,
        "",
        `💌 @${firstNumber} + @${secondNumber}`,
        "",
        "🥂 Que nunca faltem carinho, risadas e memes nessa união.",
        "🌸 Felicidades aos recém-casados!"
    ].join("\n");
}

async function downloadProfilePicture(sock, participantJid) {
    if (typeof sock.profilePictureUrl !== "function") return null;

    try {
        const imageUrl = await sock.profilePictureUrl(participantJid, "image");
        if (typeof imageUrl !== "string") return null;

        const parsedUrl = new URL(imageUrl);
        if (parsedUrl.protocol !== "https:") return null;

        const response = await fetch(parsedUrl, {
            signal: AbortSignal.timeout(PROFILE_PICTURE_TIMEOUT_MS),
            redirect: "follow"
        });

        if (!response.ok) return null;

        const finalUrl = new URL(response.url || imageUrl);
        if (finalUrl.protocol !== "https:") return null;

        const mimeType = String(response.headers.get("content-type") || "")
            .split(";")[0]
            .trim()
            .toLowerCase();

        if (!ALLOWED_IMAGE_TYPES.has(mimeType) || !response.body) return null;

        const contentLength = Number(response.headers.get("content-length") || 0);
        if (contentLength > MAX_PROFILE_PICTURE_BYTES) {
            await response.body.cancel().catch(() => {});
            return null;
        }

        const reader = response.body.getReader();
        const chunks = [];
        let totalBytes = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = Buffer.from(value);
            totalBytes += chunk.length;

            if (totalBytes > MAX_PROFILE_PICTURE_BYTES) {
                await reader.cancel().catch(() => {});
                return null;
            }

            chunks.push(chunk);
        }

        if (totalBytes === 0) return null;

        return {
            buffer: Buffer.concat(chunks, totalBytes),
            mimeType
        };
    } catch {
        return null;
    }
}

async function getParticipantDisplayName(sock, groupJid, participantJid, fallback) {
    if (typeof sock.groupMetadata !== "function") return fallback;

    try {
        const metadata = await sock.groupMetadata(groupJid);
        const participant = metadata.participants?.find(item => {
            const identifiers = [item?.id, item?.jid, item?.lid];
            return identifiers.some(identifier => normalizeJid(identifier) === participantJid);
        });

        return cleanWeddingName(
            participant?.notify || participant?.name || participant?.verifiedName || fallback,
            fallback
        );
    } catch {
        return fallback;
    }
}

function getDisplayNameFromJid(jid, fallback) {
    const localPart = jid.split("@")[0];
    if (!localPart || /^\d+$/.test(localPart)) return fallback;
    return cleanWeddingName(localPart, fallback);
}

function getCurrentDateLabel() {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "long"
    }).format(new Date());
}

export default {
    name: "casar",
    aliases: ["casamento"],
    description: "Casa você virtualmente com uma pessoa do grupo",

    async execute(sock, msg) {
        const groupJid = msg.key?.remoteJid;
        if (!groupJid) return;

        const participants = resolveMarriageParticipants(msg, sock.user?.id);
        if (!participants.ok) {
            const messages = {
                group: "💍 O casamento virtual acontece nos grupos! Use .casar @pessoa por lá.",
                mention: "💗 Marque exatamente uma pessoa para realizar o casamento: .casar @pessoa",
                sender: "⚠️ Não consegui identificar quem está enviando o pedido.",
                self: "😂 Casar consigo mesmo ainda não foi liberado! Marque outra pessoa."
            };

            await sock.sendMessage(groupJid, {
                text: messages[participants.reason] || "❌ Não consegui iniciar esse casamento."
            }, { quoted: msg });
            return;
        }

        const { first, second } = participants;

        try {
            const firstFallback = cleanWeddingName(msg.pushName, getDisplayNameFromJid(first, "Pessoa 1"));
            const secondFallback = getDisplayNameFromJid(second, "Pessoa marcada");

            const [firstName, secondName, firstPhoto, secondPhoto] = await Promise.all([
                Promise.resolve(firstFallback),
                getParticipantDisplayName(sock, groupJid, second, secondFallback),
                downloadProfilePicture(sock, first),
                downloadProfilePicture(sock, second)
            ]);

            const svg = buildWeddingCardSvg({
                firstName,
                secondName,
                firstPhoto,
                secondPhoto,
                date: getCurrentDateLabel()
            });

            const caption = buildMarriageCaption(firstName, first, secondName, second);
            const mentions = [first, second];

            try {
                const image = await renderWeddingCard(svg, {
                    firstName,
                    secondName,
                    firstPhoto,
                    secondPhoto,
                    date: getCurrentDateLabel()
                });
                await sock.sendMessage(groupJid, {
                    image,
                    caption,
                    mentions
                }, { quoted: msg });
            } catch (imageError) {
                console.error("❌ Não foi possível renderizar a arte do casamento:", imageError?.message || imageError);
                await sock.sendMessage(groupJid, {
                    text: `${caption}\n\n🖼️ Não consegui montar a imagem neste ambiente, mas o casamento está celebrado!`,
                    mentions
                }, { quoted: msg });
            }
        } catch (error) {
            console.error("❌ Erro no comando .casar:", error?.message || error);
            await sock.sendMessage(groupJid, {
                text: "💍 O casamento foi interrompido por um probleminha técnico. Tente novamente daqui a pouquinho."
            }, { quoted: msg });
        }
    }
};
