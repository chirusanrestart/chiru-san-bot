import fs from "node:fs/promises";
import path from "node:path";

const statePath = path.resolve(
    process.env.GROUP_RANKINGS_FILE?.trim() || "data/group-rankings.json"
);
const FLUSH_DELAY_MS = 750;
const MAX_RANK_LIMIT = 30;

let statePromise = null;
let flushTimer = null;
let writeQueue = Promise.resolve();

function createEmptyState() {
    return {
        version: 1,
        updatedAt: null,
        groups: {}
    };
}

function validateState(value) {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        !value.groups ||
        typeof value.groups !== "object" ||
        Array.isArray(value.groups)
    ) {
        throw new Error("O arquivo de ranking precisa conter um objeto JSON com grupos.");
    }

    return {
        version: 1,
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
        groups: value.groups
    };
}

async function loadState() {
    if (!statePromise) {
        statePromise = fs.readFile(statePath, "utf8")
            .then(raw => validateState(JSON.parse(raw)))
            .catch(error => {
                if (error.code === "ENOENT") return createEmptyState();
                statePromise = null;
                throw error;
            });
    }

    return statePromise;
}

function cleanDisplayName(value) {
    if (typeof value !== "string") return "";

    return value
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
}

function getMessagePayload(message) {
    let payload = message;

    for (let depth = 0; depth < 5 && payload; depth++) {
        const nested = payload.ephemeralMessage?.message
            || payload.viewOnceMessage?.message
            || payload.viewOnceMessageV2?.message
            || payload.documentWithCaptionMessage?.message;

        if (!nested) break;
        payload = nested;
    }

    return payload;
}

function getMessageText(message) {
    return String(
        message?.conversation
        || message?.extendedTextMessage?.text
        || message?.imageMessage?.caption
        || message?.videoMessage?.caption
        || message?.documentMessage?.caption
        || ""
    );
}

function getMessageType(message) {
    if (
        typeof message?.conversation === "string" ||
        typeof message?.extendedTextMessage?.text === "string"
    ) {
        return "text";
    }

    const knownTypes = [
        ["imageMessage", "image"],
        ["videoMessage", "video"],
        ["audioMessage", "audio"],
        ["stickerMessage", "sticker"],
        ["documentMessage", "document"],
        ["contactMessage", "contact"],
        ["contactsArrayMessage", "contact"],
        ["locationMessage", "location"],
        ["liveLocationMessage", "location"],
        ["reactionMessage", "reaction"],
        ["pollCreationMessage", "poll"],
        ["pollCreationMessageV2", "poll"],
        ["pollCreationMessageV3", "poll"],
        ["pollUpdateMessage", "poll"],
        ["buttonsResponseMessage", "interactive"],
        ["listResponseMessage", "interactive"],
        ["templateButtonReplyMessage", "interactive"],
        ["interactiveResponseMessage", "interactive"]
    ];

    for (const [field, type] of knownTypes) {
        if (message?.[field]) return type;
    }

    if (
        message?.protocolMessage ||
        message?.senderKeyDistributionMessage ||
        message?.messageContextInfo
    ) {
        return null;
    }

    return message && Object.keys(message).length ? "other" : null;
}

function getMessageTime(value) {
    let timestamp = value;

    if (timestamp && typeof timestamp.toNumber === "function") {
        timestamp = timestamp.toNumber();
    }

    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return new Date().toISOString();
    }

    const milliseconds = numeric < 1e12 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime())
        ? new Date().toISOString()
        : date.toISOString();
}

function increment(counter, key) {
    counter[key] = (Number(counter[key]) || 0) + 1;
}

function scheduleFlush() {
    if (flushTimer) return;

    flushTimer = setTimeout(() => {
        flushTimer = null;
        flushGroupRankings().catch(error => {
            console.error("❌ Não consegui salvar o ranking dos grupos:", error?.message || error);
        });
    }, FLUSH_DELAY_MS);

    flushTimer.unref?.();
}

export async function recordGroupMessage(msg) {
    const groupJid = msg?.key?.remoteJid;
    const participantJid = msg?.key?.participant
        || msg?.participant
        || msg?.key?.participantAlt;

    if (
        msg?.key?.fromMe ||
        typeof groupJid !== "string" ||
        !groupJid.endsWith("@g.us") ||
        typeof participantJid !== "string" ||
        !participantJid.includes("@") ||
        !msg?.message ||
        typeof msg.message !== "object"
    ) {
        return false;
    }

    const payload = getMessagePayload(msg.message);
    const messageType = getMessageType(payload);
    if (!messageType) return false;

    const state = await loadState();
    const now = getMessageTime(msg.messageTimestamp);
    const group = state.groups[groupJid] || (state.groups[groupJid] = {
        id: groupJid,
        totalMessages: 0,
        firstMessageAt: now,
        lastMessageAt: now,
        messageTypes: {},
        members: {}
    });

    if (!group.messageTypes || typeof group.messageTypes !== "object" || Array.isArray(group.messageTypes)) {
        group.messageTypes = {};
    }
    if (!group.members || typeof group.members !== "object" || Array.isArray(group.members)) {
        group.members = {};
    }

    const member = group.members[participantJid] || (group.members[participantJid] = {
        id: participantJid,
        name: "",
        messages: 0,
        commands: 0,
        firstMessageAt: now,
        lastMessageAt: now,
        messageTypes: {}
    });

    if (!member.messageTypes || typeof member.messageTypes !== "object" || Array.isArray(member.messageTypes)) {
        member.messageTypes = {};
    }

    const name = cleanDisplayName(msg.pushName);
    if (name) member.name = name;

    group.totalMessages = (Number(group.totalMessages) || 0) + 1;
    member.messages = (Number(member.messages) || 0) + 1;
    increment(group.messageTypes, messageType);
    increment(member.messageTypes, messageType);

    if (getMessageText(payload).trimStart().startsWith(".")) {
        member.commands = (Number(member.commands) || 0) + 1;
    }

    group.firstMessageAt ||= now;
    group.lastMessageAt = now;
    member.firstMessageAt ||= now;
    member.lastMessageAt = now;
    state.updatedAt = now;

    scheduleFlush();
    return true;
}

export async function getGroupRanking(groupJid, limit = 10) {
    const state = await loadState();
    const group = state.groups[groupJid];
    const requestedLimit = Number(limit);
    const safeLimit = Number.isFinite(requestedLimit)
        ? Math.min(MAX_RANK_LIMIT, Math.max(1, Math.floor(requestedLimit)))
        : 10;

    if (!group || typeof group !== "object") {
        return {
            groupId: groupJid,
            totalMessages: 0,
            membersTracked: 0,
            firstMessageAt: null,
            lastMessageAt: null,
            messageTypes: {},
            members: []
        };
    }

    const members = group.members && typeof group.members === "object" && !Array.isArray(group.members)
        ? Object.entries(group.members)
        : [];
    const allMembers = members
        .filter(([, member]) => member && typeof member === "object")
        .map(([memberJid, member]) => ({
            id: member.id || memberJid,
            name: member.name || "",
            messages: Number(member.messages) || 0,
            commands: Number(member.commands) || 0,
            firstMessageAt: member.firstMessageAt || null,
            lastMessageAt: member.lastMessageAt || null,
            messageTypes: { ...(member.messageTypes || {}) }
        }))
        .sort((left, right) =>
            right.messages - left.messages ||
            String(left.id).localeCompare(String(right.id))
        );

    return {
        groupId: groupJid,
        totalMessages: Number(group.totalMessages) || 0,
        membersTracked: allMembers.length,
        firstMessageAt: group.firstMessageAt || null,
        lastMessageAt: group.lastMessageAt || null,
        messageTypes: { ...(group.messageTypes || {}) },
        members: allMembers.slice(0, safeLimit)
    };
}

export async function flushGroupRankings() {
    const state = await loadState();

    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }

    const operation = writeQueue.then(async () => {
        await fs.mkdir(path.dirname(statePath), { recursive: true });

        const temporaryPath = `${statePath}.${process.pid}.tmp`;
        try {
            await fs.writeFile(
                temporaryPath,
                `${JSON.stringify(state, null, 2)}\n`,
                "utf8"
            );
            await fs.rename(temporaryPath, statePath);
        } catch (error) {
            await fs.unlink(temporaryPath).catch(() => {});
            throw error;
        }
    });

    writeQueue = operation.catch(() => {});
    return operation;
}
