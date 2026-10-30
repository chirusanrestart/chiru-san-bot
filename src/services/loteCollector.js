import { downloadMedia } from "../utils/download.js";
import { processMedia, isMelissaApiConfigured } from "./melissaApi.js";
import { sendStickerPack } from "./stickerPack.js";

const MAX_IMAGES = 100;
const MAX_STICKERS_PER_PACK = 60;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IDLE_MS = 12_000;
const sessions = new Map();

function sessionKey(msg) {
    const jid = msg.key?.remoteJid;
    const sender = msg.key?.participant || msg.key?.remoteJid;
    return jid && sender ? `${jid}:${sender}` : null;
}

async function updateStatus(session, text) {
    if (!session.statusKey) {
        const sent = await session.sock.sendMessage(session.jid, { text }, { quoted: session.commandMessage });
        session.statusKey = sent?.key || null;
        return;
    }
    await session.sock.sendMessage(session.jid, { text, edit: session.statusKey });
}

function resetIdleTimer(session) {
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => {
        session.closing = true;
        void drainSession(session);
    }, IDLE_MS);
    session.timer.unref?.();
}

async function sendFullStickerPack(session) {
    if (!session.stickers.length) return;
    const stickers = session.stickers.splice(0, MAX_STICKERS_PER_PACK);
    const packNumber = ++session.sentPacks;
    await sendStickerPack(session.sock, session.jid, stickers, {
        name: `Chiru-san-bot • ${session.requester}`,
        publisher: `Chiru-san-bot • ${session.requester}`,
        description: `🌸 Lote de imagens • ${session.requester} • pack ${packNumber}`
    });
    stickers.length = 0;
}

async function drainSession(session) {
    if (session.processing) return;
    session.processing = true;

    try {
        while (session.queue.length) {
            const msg = session.queue.shift();
            const image = msg.message?.imageMessage;
            if (!image) continue;

            try {
                const media = await downloadMedia(image, "image");
                if (!media.length || media.length > MAX_IMAGE_BYTES) {
                    session.failed++;
                    continue;
                }

                const result = await processMedia("sticker", media, {
                    animated: false,
                    packname: "Chiru-san-bot",
                    publisher: session.requester
                });

                if (!result?.data?.length || result.data.length > 1024 * 1024) {
                    session.failed++;
                    continue;
                }

                session.stickers.push(result.data);
                session.processed++;

                if (session.stickers.length >= MAX_STICKERS_PER_PACK) {
                    await sendFullStickerPack(session);
                }

                if (session.processed % 5 === 0) {
                    await updateStatus(session,
                        `📦 Processando lote de imagens\n\n✅ Processadas: *${session.processed}*\n📥 Recebidas: *${session.received}/${MAX_IMAGES}*\n❌ Falhas: *${session.failed}*`);
                }
            } catch (error) {
                session.failed++;
                console.warn("[LOTE] Falha ao processar imagem:", error.message);
            }
        }

        if (session.closing && session.queue.length === 0) {
            if (session.timer) clearTimeout(session.timer);
            if (session.stickers.length) await sendFullStickerPack(session);

            await updateStatus(session,
                `🏁 Lote finalizado!\n\n✅ Imagens processadas: *${session.processed}*\n📦 Packs enviados: *${session.sentPacks}*\n❌ Falhas: *${session.failed}*`);
            sessions.delete(session.key);
        }
    } catch (error) {
        console.error("[LOTE] Erro finalizando lote:", error);
        await updateStatus(session, "❌ Ocorreu um erro ao finalizar o lote de imagens.").catch(() => {});
        sessions.delete(session.key);
    } finally {
        session.processing = false;
        if (session.queue.length || session.closing) {
            if (session.queue.length || sessions.has(session.key)) void drainSession(session);
        }
    }
}

export async function startLote(sock, msg) {
    const key = sessionKey(msg);
    if (!key) return;
    if (!isMelissaApiConfigured()) {
        await sock.sendMessage(msg.key.remoteJid, { text: "☁️ O processamento em nuvem não está configurado neste bot." }, { quoted: msg });
        return;
    }

    const existing = sessions.get(key);
    if (existing) {
        if (existing.timer) clearTimeout(existing.timer);
        existing.closing = true;
        await drainSession(existing);
    }

    const session = {
        key,
        sock,
        jid: msg.key.remoteJid,
        commandMessage: msg,
        requester: String(msg.pushName || msg.verifiedBizName || "usuário").trim().slice(0, 80),
        queue: [],
        stickers: [],
        received: 0,
        processed: 0,
        failed: 0,
        sentPacks: 0,
        processing: false,
        closing: false,
        timer: null,
        statusKey: null
    };

    sessions.set(key, session);
    await updateStatus(session,
        "📦 *Modo lote ativado!*\n\nEnvie até 100 fotos, inclusive em álbum. Vou processar uma por vez na nuvem.\n\nEnvie *fim* ou aguarde 12 segundos sem novas fotos para concluir.");
}

export async function handleLoteMessage(sock, msg) {
    const key = sessionKey(msg);
    if (!key) return false;
    const session = sessions.get(key);
    if (!session) return false;

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
    if (/^\.?fim$/i.test(String(text).trim())) {
        session.closing = true;
        if (session.timer) clearTimeout(session.timer);
        await updateStatus(session, "⏳ Finalizando o lote e enviando os packs...");
        void drainSession(session);
        return true;
    }

    const image = msg.message?.imageMessage;
    if (!image) return false;

    if (session.closing) return true;
    if (session.received >= MAX_IMAGES) {
        await updateStatus(session, "⚠️ Limite de 100 fotos atingido. Envie *fim* para concluir.");
        return true;
    }

    session.queue.push(msg);
    session.received++;
    resetIdleTimer(session);
    void drainSession(session);
    return true;
}
