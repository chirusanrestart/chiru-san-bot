import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const directory = path.resolve("src/data");
const file = path.join(directory, "character-chat.json");
const fileLock = `${file}.lock`;
const conversationLockDirectory = path.join(directory, ".conversation-locks");
const FILE_LOCK_STALE_MS = 60_000;
const FILE_LOCK_TIMEOUT_MS = 30_000;
// Mantém mais contexto por personagem sem ultrapassar indefinidamente o limite de tokens.
const MAX_HISTORY_MESSAGES = 40;
const MAX_STORED_SESSIONS = 500;
let queue = Promise.resolve();
const conversationLocks = new Map();
const userMemoryLocks = new Map();

function lockState(userId) {
    let state = userMemoryLocks.get(userId);
    if (!state) {
        state = { readers: 0, writer: false, queue: [] };
        userMemoryLocks.set(userId, state);
    }
    return state;
}

function releaseFor(userId, state, mode) {
    let done = false;
    return () => {
        if (done) return;
        done = true;
        if (mode === "write") state.writer = false;
        else state.readers--;
        drain(userId, state);
        if (!state.readers && !state.writer && !state.queue.length &&
            userMemoryLocks.get(userId) === state) userMemoryLocks.delete(userId);
    };
}

function drain(userId, state) {
    if (state.writer || state.readers || !state.queue.length) return;
    if (state.queue[0].mode === "write") {
        state.writer = true;
        state.queue.shift().resolve(releaseFor(userId, state, "write"));
        return;
    }
    while (state.queue.length && state.queue[0].mode === "read") {
        state.readers++;
        state.queue.shift().resolve(releaseFor(userId, state, "read"));
    }
}

async function acquire(userId, mode) {
    const state = lockState(userId);
    if (mode === "read" && !state.writer &&
        !state.queue.some(item => item.mode === "write")) {
        state.readers++;
        return releaseFor(userId, state, "read");
    }
    if (mode === "write" && !state.writer && !state.readers && !state.queue.length) {
        state.writer = true;
        return releaseFor(userId, state, "write");
    }
    return new Promise(resolve => {
        state.queue.push({ mode, resolve });
        drain(userId, state);
    });
}

export async function withUserMemoryLock(userId, mode, operation) {
    if (mode !== "read" && mode !== "write") throw new TypeError("Invalid memory lock mode");
    const release = await acquire(userId, mode);
    try {
        return await operation();
    } finally {
        release();
    }
}

async function processIsAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code === "EPERM";
    }
}

// Lock no sistema de arquivos: também coordena duas instâncias Node/PM2.
// O lock só envolve operações curtas de leitura/gravação, nunca a chamada à IA.
async function withNamedFileLock(lockPath, operation, timeoutMs = FILE_LOCK_TIMEOUT_MS) {
    await fs.mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
    const startedAt = Date.now();

    while (true) {
        let handle;
        try {
            handle = await fs.open(lockPath, "wx", 0o600);
            await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
            try {
                return await operation();
            } finally {
                await handle.close().catch(() => {});
                await fs.unlink(lockPath).catch(error => {
                    if (error.code !== "ENOENT") throw error;
                });
            }
        } catch (error) {
            if (handle) {
                await handle.close().catch(() => {});
                await fs.unlink(lockPath).catch(() => {});
                throw error;
            }
            if (error.code !== "EEXIST") throw error;

            // Recupera um lock abandonado após encerramento/crash do processo.
            try {
                const stat = await fs.stat(lockPath);
                if (Date.now() - stat.mtimeMs > FILE_LOCK_STALE_MS) {
                    let owner = null;
                    try {
                        owner = JSON.parse(await fs.readFile(lockPath, "utf8"));
                    } catch {}
                    if (!owner || !(await processIsAlive(Number(owner.pid)))) {
                        await fs.unlink(lockPath).catch(unlinkError => {
                            if (unlinkError.code !== "ENOENT") throw unlinkError;
                        });
                        continue;
                    }
                }
            } catch (statError) {
                if (statError.code === "ENOENT") continue;
                throw statError;
            }

            if (timeoutMs !== null && Date.now() - startedAt >= timeoutMs) {
                throw new Error("Tempo esgotado aguardando o bloqueio da memória de personagens.");
            }
            await new Promise(resolve => setTimeout(resolve, 25));
        }
    }
}

async function withFileLock(operation) {
    return withNamedFileLock(fileLock, operation);
}

function conversationLockPath(key) {
    const hash = createHash("sha256").update(key).digest("hex");
    return path.join(conversationLockDirectory, `${hash}.lock`);
}

function serialize(operation) {
    const current = queue.then(() => withFileLock(operation), () => withFileLock(operation));
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
    return withUserMemoryLock(userId, "read", async () => {
        const key = activeKey(userId, chatId, characterId);
        const previous = conversationLocks.get(key) || Promise.resolve();
        let release;
        const current = new Promise(resolve => { release = resolve; });
        const tail = previous.catch(() => {}).then(() => current);
        conversationLocks.set(key, tail);
        await previous.catch(() => {});
        try {
            // Também serializa a mesma conversa quando há mais de um processo Node/PM2.
            // O lock é específico da conversa, então personagens diferentes continuam independentes.
            return await withNamedFileLock(conversationLockPath(key), operation, null);
        } finally {
            release();
            if (conversationLocks.get(key) === tail) conversationLocks.delete(key);
        }
    });
}

// Evita que o arquivo de memória cresça sem limite. Conversas antigas
// não têm comando de restauração, então as sessões mais velhas são podadas.
function pruneSessions(state) {
    const activeSessionKeys = new Set();
    for (const [key, conversationId] of Object.entries(state.activeSessions)) {
        try {
            const [userId, chatId, characterId] = JSON.parse(key);
            activeSessionKeys.add(sessionKey(userId, chatId, characterId, conversationId));
        } catch {
            delete state.activeSessions[key];
        }
    }

    const entries = Object.entries(state.sessions)
        .sort((a, b) => {
            const aActive = activeSessionKeys.has(a[0]) ? 1 : 0;
            const bActive = activeSessionKeys.has(b[0]) ? 1 : 0;
            if (aActive !== bActive) return bActive - aActive;
            return (Number(b[1]?.updatedAt) || 0) - (Number(a[1]?.updatedAt) || 0);
        });

    if (entries.length > MAX_STORED_SESSIONS) {
        for (const [key] of entries.slice(MAX_STORED_SESSIONS)) {
            delete state.sessions[key];
        }
    }

    // Remove referências para sessões que foram podadas ou apagadas.
    for (const [key, conversationId] of Object.entries(state.activeSessions)) {
        try {
            const [userId, chatId, characterId] = JSON.parse(key);
            if (!state.sessions[sessionKey(userId, chatId, characterId, conversationId)]) {
                delete state.activeSessions[key];
            }
        } catch {
            delete state.activeSessions[key];
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
        if (!conversationId || !state.sessions[sessionKey(userId, chatId, characterId, conversationId)]) {
            conversationId = randomUUID();
            state.activeSessions[key] = conversationId;
            state.sessions[sessionKey(userId, chatId, characterId, conversationId)] = {
                history: [], updatedAt: Date.now()
            };
            pruneSessions(state);
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
        // Uma resposta que terminou depois de .novaconversa/.novaconversa limpar
        // não pode recriar nem contaminar a sessão antiga.
        if (state.activeSessions[activeKey(userId, chatId, characterId)] !== conversationId ||
            !state.sessions[key]) return false;
        const session = state.sessions[key];
        if (!Array.isArray(session.history)) session.history = [];
        session.history.push(
            { role: "user", content: String(userText).slice(0, 2000) },
            { role: "assistant", content: String(assistantText).slice(0, 5000) }
        );
        session.history = session.history.slice(-MAX_HISTORY_MESSAGES);
        session.updatedAt = Date.now();
        state.sessions[key] = session;
        pruneSessions(state);
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
        pruneSessions(state);
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
