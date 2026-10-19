import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const HISTORY_FILE = path.join(DATA_DIR, "megapack-history.json");
const SCAN_STATE_FILE = path.join(DATA_DIR, "megapack-history-scan.json");
const PENDING_DIR = path.join(DATA_DIR, "megapack-history-pending");
let writeChain = Promise.resolve();
let scanChain = Promise.resolve();
let pendingWriteChain = Promise.resolve();

async function readHistory() {
    try {
        const parsed = JSON.parse(await fs.readFile(HISTORY_FILE, "utf8"));
        // Migração automática do formato antigo por usuário para um catálogo global.
        if (Array.isArray(parsed)) return { packs: parsed };
        if (Array.isArray(parsed?.packs)) return parsed;
        const packs = [];
        for (const entry of Object.values(parsed || {})) {
            if (!Array.isArray(entry?.packs)) continue;
            packs.push(...entry.packs);
        }
        return { packs };
    } catch (error) {
        if (error.code === "ENOENT") return { packs: [] };
        throw error;
    }
}

async function writeHistoryOperation(operation) {
    const queued = writeChain.then(operation);
    writeChain = queued.catch(() => {});
    return queued;
}

export async function rememberMegapack({ query }) {
    const normalized = String(query || "").trim();
    if (!normalized) return;

    return writeHistoryOperation(async () => {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const history = await readHistory();
        const existing = history.packs.find(
            pack => String(pack.name || "").toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR")
        );
        const now = new Date().toISOString();
        if (existing) {
            existing.lastRequestedAt = now;
            existing.requestCount = (Number(existing.requestCount) || 1) + 1;
        } else {
            history.packs.push({
                name: normalized,
                firstRequestedAt: now,
                lastRequestedAt: now,
                requestCount: 1
            });
        }
        history.packs.sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
        await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2) + "\n", "utf8");
    });
}

function getMessageText(msg) {
    let message = msg?.message;
    // Mensagens podem vir encapsuladas em formatos usados pelo WhatsApp.
    for (let i = 0; i < 5 && message; i++) {
        const wrapped = message.ephemeralMessage?.message
            || message.viewOnceMessage?.message
            || message.viewOnceMessageV2?.message
            || message.documentWithCaptionMessage?.message;
        if (!wrapped) break;
        message = wrapped;
    }

    return String(
        message?.conversation
        || message?.extendedTextMessage?.text
        || message?.imageMessage?.caption
        || message?.videoMessage?.caption
        || message?.documentMessage?.caption
        || ""
    );
}

function extractPackQueryFromText(text) {
    const match = String(text || "").match(/^\s*\.pack\s+([\s\S]*?)\s*$/i);
    return match?.[1]?.trim() || null;
}

async function rememberHistoricalPacks(queries) {
    const normalized = [...new Set(
        queries.map(query => String(query || "").trim()).filter(Boolean)
    )];
    if (!normalized.length) return 0;

    return writeHistoryOperation(async () => {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const history = await readHistory();
        const known = new Set(history.packs.map(
            pack => String(pack.name || "").trim().toLocaleLowerCase("pt-BR")
        ));
        const now = new Date().toISOString();
        let added = 0;

        for (const name of normalized) {
            const key = name.toLocaleLowerCase("pt-BR");
            if (known.has(key)) continue;
            known.add(key);
            history.packs.push({
                name,
                firstRequestedAt: now,
                lastRequestedAt: now,
                requestCount: 1,
                discoveredFrom: "historical-scan"
            });
            added++;
        }

        if (added) {
            history.packs.sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
            await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2) + "\n", "utf8");
        }
        return added;
    });
}

async function readScanState() {
    try {
        return JSON.parse(await fs.readFile(SCAN_STATE_FILE, "utf8"));
    } catch (error) {
        if (error.code === "ENOENT") {
            return { batches: 0, messagesScanned: 0, commandsFound: 0, uniqueNamesAdded: 0 };
        }
        throw error;
    }
}

async function writeScanState(state) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tempFile = SCAN_STATE_FILE + ".tmp";
    await fs.writeFile(tempFile, JSON.stringify(state, null, 2) + "\n", "utf8");
    await fs.rename(tempFile, SCAN_STATE_FILE);
}

async function drainPendingHistoryFiles() {
    await pendingWriteChain;
    await fs.mkdir(PENDING_DIR, { recursive: true });
    const state = await readScanState();
    const chunkSize = 100;

    while (true) {
        const files = (await fs.readdir(PENDING_DIR))
            .filter(name => name.endsWith(".json"))
            .sort();
        if (!files.length) {
            delete state.activeBatchFile;
            delete state.activeBatchNextIndex;
            await writeScanState(state);
            return;
        }

        const fileName = files.includes(state.activeBatchFile)
            ? state.activeBatchFile
            : files[0];
        const filePath = path.join(PENDING_DIR, fileName);
        const pending = JSON.parse(await fs.readFile(filePath, "utf8"));
        let nextIndex = files.includes(state.activeBatchFile)
            ? Math.min(Number(state.activeBatchNextIndex) || 0, pending.messages.length)
            : 0;

        state.activeBatchFile = fileName;
        state.activeBatchNextIndex = nextIndex;
        await writeScanState(state);

        console.log(`🔎 Megapack: retomando varredura de ${pending.messages.length} mensagens históricas (posição ${nextIndex}).`);

        while (nextIndex < pending.messages.length) {
            const end = Math.min(nextIndex + chunkSize, pending.messages.length);
            const chunk = pending.messages.slice(nextIndex, end);
            const found = [];
            for (const text of chunk) {
                const query = extractPackQueryFromText(text);
                if (query) found.push(query);
            }

            const added = await rememberHistoricalPacks(found);
            state.messagesScanned = (Number(state.messagesScanned) || 0) + chunk.length;
            state.commandsFound = (Number(state.commandsFound) || 0) + found.length;
            state.uniqueNamesAdded = (Number(state.uniqueNamesAdded) || 0) + added;
            state.lastBatchAt = new Date().toISOString();
            state.isLatestHistoryBatch = Boolean(pending.isLatest);
            state.lastBatchSize = pending.messages.length;
            state.activeBatchNextIndex = end;
            nextIndex = end;
            await writeScanState(state);

            // Cede o event loop para que mensagens e comandos normais continuem fluindo.
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const allFound = pending.messages.reduce((count, text) => count + (extractPackQueryFromText(text) ? 1 : 0), 0);
        state.batches = (Number(state.batches) || 0) + 1;
        state.lastBatchProcessed = pending.messages.length;
        state.lastBatchUniqueCommands = allFound;
        state.lastCompletedAt = new Date().toISOString();

        // Apaga a fila antes de limpar o checkpoint. Se houver reinício entre
        // estas operações, o próximo início detectará que o arquivo já sumiu.
        await fs.unlink(filePath).catch(error => {
            if (error.code !== "ENOENT") throw error;
        });
        delete state.activeBatchFile;
        delete state.activeBatchNextIndex;
        await writeScanState(state);
        console.log(`✅ Megapack: ${pending.messages.length} mensagens analisadas; ${allFound} comandos .pack encontrados neste lote.`);
    }
}

export function scanHistoricalMessages(messages, isLatest = false) {
    const batch = Array.isArray(messages) ? messages : [];
    if (!batch.length) return Promise.resolve();

    const persist = pendingWriteChain.then(async () => {
        await fs.mkdir(PENDING_DIR, { recursive: true });
        const fileName = `${Date.now()}-${randomUUID()}.json`;
        const filePath = path.join(PENDING_DIR, fileName);
        const tempPath = filePath + ".tmp";
        // Guarda só o texto das mensagens, não mídia nem dados privados desnecessários.
        const snapshot = {
            isLatest: Boolean(isLatest),
            messages: batch.map(getMessageText)
        };
        await fs.writeFile(tempPath, JSON.stringify(snapshot), "utf8");
        await fs.rename(tempPath, filePath);
        return fileName;
    });
    pendingWriteChain = persist.catch(() => {});

    const operation = scanChain.then(async () => {
        await persist;
        await drainPendingHistoryFiles();
    });
    scanChain = operation.catch(error => {
        console.error("❌ Erro varrendo histórico para o megapack:", error);
    });
    return operation;
}

export function resumeHistoricalScan() {
    const operation = scanChain.then(async () => {
        await pendingWriteChain;
        await drainPendingHistoryFiles();
    });
    scanChain = operation.catch(error => {
        console.error("❌ Erro retomando varredura do histórico para o megapack:", error);
    });
    return operation;
}

export async function getMegapackScanStatus() {
    await scanChain;
    return readScanState();
}

export async function getMegapackHistory() {
    await writeChain;
    const history = await readHistory();
    return history.packs || [];
}
