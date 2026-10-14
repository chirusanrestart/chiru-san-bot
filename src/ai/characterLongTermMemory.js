import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const directory = path.resolve("src/data");
const file = path.join(directory, "character-long-term-memory.json");
const lockPath = `${file}.lock`;
const MAX_MEMORIES = 20;
const MAX_MEMORY_LENGTH = 240;
const EXTRACT_EVERY_TURNS = 4;
const LOCK_TIMEOUT_MS = 15000;
let queue = Promise.resolve();

const keyFor = (userId, chatId, characterId) =>
    JSON.stringify([String(userId), String(chatId), String(characterId)]);

async function withFileLock(operation) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const started = Date.now();
    while (true) {
        let handle;
        try {
            handle = await fs.open(lockPath, "wx", 0o600);
            await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
            try {
                return await operation();
            } finally {
                await handle.close().catch(() => {});
                await fs.unlink(lockPath).catch(() => {});
            }
        } catch (error) {
            if (handle) {
                await handle.close().catch(() => {});
                await fs.unlink(lockPath).catch(() => {});
                throw error;
            }
            if (error.code !== "EEXIST") throw error;
            try {
                const stat = await fs.stat(lockPath);
                if (Date.now() - stat.mtimeMs > 60000) {
                    let owner;
                    try { owner = JSON.parse(await fs.readFile(lockPath, "utf8")); } catch {}
                    let alive = false;
                    if (Number.isInteger(owner?.pid) && owner.pid > 0) {
                        try { process.kill(owner.pid, 0); alive = true; }
                        catch (e) { alive = e.code === "EPERM"; }
                    }
                    if (!alive) {
                        await fs.unlink(lockPath).catch(() => {});
                        continue;
                    }
                }
            } catch (e) {
                if (e.code === "ENOENT") continue;
                throw e;
            }
            if (Date.now() - started >= LOCK_TIMEOUT_MS) {
                throw new Error("Tempo esgotado aguardando o bloqueio da memória duradoura.");
            }
            await new Promise(resolve => setTimeout(resolve, 30));
        }
    }
}

async function readState() {
    try {
        const state = JSON.parse(await fs.readFile(file, "utf8"));
        if (state?.version !== 1 || !state.entries || typeof state.entries !== "object" || Array.isArray(state.entries)) {
            throw new Error("Formato inválido na memória duradoura dos personagens.");
        }
        return state;
    } catch (error) {
        if (error.code === "ENOENT") return { version: 1, entries: {} };
        throw error;
    }
}

async function writeState(state) {
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await fs.rename(temporary, file);
    await fs.chmod(file, 0o600).catch(() => {});
}

function serialize(operation) {
    const current = queue.then(() => withFileLock(operation), () => withFileLock(operation));
    queue = current.catch(() => {});
    return current;
}

function normalizeMemories(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const output = [];
    for (const value of values) {
        if (typeof value !== "string") continue;
        const memory = value.replace(/\s+/g, " ").trim().slice(0, MAX_MEMORY_LENGTH);
        const normalized = memory.toLocaleLowerCase("pt-BR");
        if (!memory || seen.has(normalized)) continue;
        seen.add(normalized);
        output.push(memory);
        if (output.length >= MAX_MEMORIES) break;
    }
    return output;
}

export async function getCharacterLongTermMemory(userId, chatId, characterId) {
    return serialize(async () => {
        const state = await readState();
        const entry = state.entries[keyFor(userId, chatId, characterId)];
        return {
            memories: normalizeMemories(entry?.memories),
            turnCount: Math.max(0, Number(entry?.turnCount) || 0),
            lastExtractedTurn: Math.max(0, Number(entry?.lastExtractedTurn) || 0),
        };
    });
}

export async function registerCharacterTurn(userId, chatId, characterId) {
    return serialize(async () => {
        const state = await readState();
        const key = keyFor(userId, chatId, characterId);
        const entry = state.entries[key] ??= { memories: [], turnCount: 0, lastExtractedTurn: 0 };
        entry.turnCount = Math.max(0, Number(entry.turnCount) || 0) + 1;
        const shouldExtract = entry.turnCount - (Number(entry.lastExtractedTurn) || 0) >= EXTRACT_EVERY_TURNS;
        await writeState(state);
        return { turnCount: entry.turnCount, shouldExtract };
    });
}

export async function mergeCharacterLongTermMemory(userId, chatId, characterId, memories, throughTurn) {
    return serialize(async () => {
        const state = await readState();
        const key = keyFor(userId, chatId, characterId);
        const entry = state.entries[key] ??= { memories: [], turnCount: 0, lastExtractedTurn: 0 };
        entry.memories = normalizeMemories([
            ...normalizeMemories(memories),
            ...normalizeMemories(entry.memories),
        ]);
        entry.lastExtractedTurn = Math.max(
            Number(entry.lastExtractedTurn) || 0,
            Math.min(Number(throughTurn) || 0, Number(entry.turnCount) || 0),
        );
        await writeState(state);
        return { memories: entry.memories, turnCount: entry.turnCount };
    });
}

export async function clearCharacterLongTermMemory(userId, chatId, characterId) {
    return serialize(async () => {
        const state = await readState();
        delete state.entries[keyFor(userId, chatId, characterId)];
        await writeState(state);
    });
}

export async function clearUserLongTermMemory(userId) {
    return serialize(async () => {
        const state = await readState();
        for (const key of Object.keys(state.entries)) {
            try {
                if (JSON.parse(key)[0] === String(userId)) delete state.entries[key];
            } catch {
                delete state.entries[key];
            }
        }
        await writeState(state);
    });
}

export const characterMemoryLimits = Object.freeze({
    maxMemories: MAX_MEMORIES,
    maxMemoryLength: MAX_MEMORY_LENGTH,
    extractEveryTurns: EXTRACT_EVERY_TURNS,
});
