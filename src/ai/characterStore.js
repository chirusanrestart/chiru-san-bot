import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const directory = path.resolve("src/data");
const file = path.join(directory, "character-chat.json");
const MAX_HISTORY_MESSAGES = 12;
let queue = Promise.resolve();
const conversationLocks = new Map();

function serialize(operation) {
    const current = queue.then(operation, operation);
    queue = current.catch(() => {});
    return current;
}

function pairKey(userId, chatId) {
    return JSON.stringify([userId, chatId]);
}
function activeKey(userId, chatId, characterId) {
    return JSON.stringify([userId, chatId, characterId]);
}
function sessionKey(userId, chatId, characterId, conversationId) {
    return JSON.stringify([userId, chatId, characterId, conversationId]);
}

// Garante que mensagens rápidas do mesmo usuário/chat/personagem sejam
// respondidas em sequência, sempre usando o histórico atualizado.
export async function withConversationLock(userId, chatId, characterId, operation) {
    const key = activeKey(userId, chatId, characterId);
    const previous = conversationLocks.get(key) || Promise.resolve();
    let release;
    const current = new Promise(resolve => {
        release = resolve;
    });
    const tail = previous.catch(() => {}).then(() => current);
    conversationLocks.set(key, tail);

    await previous.catch(() => {});
    try {
        return await operation();
    } finally {
        release();
        if (conversationLocks.get(key) === tail) {
            conversationLocks.delete(key);
        }
    }
}

async function readState() {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    try {
        const parsed = JSON.parse(await fs.readFile(file, "utf8"));
        if (!parsed || parsed.version !== 1 ||
            typeof parsed.selections !== "object" ||
            typeof parsed.activeSessions !== "object" ||
            typeof parsed.sessions !== "object") {
            throw new Error("Formato inválido no arquivo de conversas.");
        }
        return parsed;
    } catch (error) {
        if (error.code === "ENOENT") {
            return { version: 1, selections: {}, activeSessions: {}, sessions: {} };
        }
        throw error;
    }
}

async function writeState(state) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await fs.rename(temporary, file);
    await fs.chmod(file, 0o600).catch(() => {});
}

export async function getSelectedCharacter(userId, chatId) {
    return serialize(async () => {
        const state = await readState();
        return state.selections[pairKey(userId, chatId)] || null;
    });
}

export async function setSelectedCharacter(userId, chatId, characterId) {
    return serialize(async () => {
        const state = await readState();
        state.selections[pairKey(userId, chatId)] = characterId;
        await writeState(state);
    });
}

export async function getConversation(userId, chatId, characterId) {
    return serialize(async () => {
        const state = await readState();
        const key = activeKey(userId, chatId, characterId);
        let conversationId = state.activeSessions[key];
        if (!conversationId) {
            conversationId = randomUUID();
            state.activeSessions[key] = conversationId;
            state.sessions[sessionKey(userId, chatId, characterId, conversationId)] = {
                history: [], updatedAt: Date.now()
            };
            await writeState(state);
        }
        const session = state.sessions[sessionKey(userId, chatId, characterId, conversationId)];
        return { conversationId, history: Array.isArray(session?.history) ? session.history : [] };
    });
}

export async function appendTurn(userId, chatId, characterId, conversationId, userText, assistantText) {
    return serialize(async () => {
        const state = await readState();
        const key = sessionKey(userId, chatId, characterId, conversationId);
        const session = state.sessions[key] || { history: [] };
        if (!Array.isArray(session.history)) session.history = [];
        session.history.push(
            { role: "user", content: String(userText).slice(0, 2000) },
            { role: "assistant", content: String(assistantText).slice(0, 5000) }
        );
        session.history = session.history.slice(-MAX_HISTORY_MESSAGES);
        session.updatedAt = Date.now();
        state.sessions[key] = session;
        await writeState(state);
    });
}

export async function startNewConversation(userId, chatId, characterId) {
    return serialize(async () => {
        const state = await readState();
        const id = randomUUID();
        state.activeSessions[activeKey(userId, chatId, characterId)] = id;
        state.sessions[sessionKey(userId, chatId, characterId, id)] = {
            history: [], updatedAt: Date.now()
        };
        await writeState(state);
    });
}

export async function clearUserHistory(userId) {
    return serialize(async () => {
        const state = await readState();
        for (const key of Object.keys(state.sessions)) {
            try {
                if (JSON.parse(key)[0] === userId) delete state.sessions[key];
            } catch { delete state.sessions[key]; }
        }
        for (const key of Object.keys(state.activeSessions)) {
            try {
                if (JSON.parse(key)[0] === userId) delete state.activeSessions[key];
            } catch { delete state.activeSessions[key]; }
        }
        await writeState(state);
    });
}

export const historyLimit = MAX_HISTORY_MESSAGES;
