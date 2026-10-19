import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const HISTORY_FILE = path.join(DATA_DIR, "megapack-history.json");
const SCAN_STATE_FILE = path.join(DATA_DIR, "megapack-history-scan.json");
let writeChain = Promise.resolve();
let scanChain = Promise.resolve();

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

function extractPackQuery(msg) {
    const text = getMessageText(msg);
    // Só registra comandos reais iniciados por .pack, não menções no meio da conversa.
    const match = text.match(/^\s*\.pack\s+([\s\S]*?)\s*$/i);
    const query = match?.[1]?.trim();
    return query || null;
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
    await fs.writeFile(SCAN_STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/**
 * Processa em pequenos lotes para deixar o event loop livre entre os lotes.
 * O Baileys só entrega o histórico que o WhatsApp disponibilizar para esta sessão.
 */
export function scanHistoricalMessages(messages, isLatest = false) {
    const batch = Array.isArray(messages) ? messages : [];
    if (!batch.length) return Promise.resolve();

    const operation = scanChain.then(async () => {
        const state = await readScanState();
        const batchCommands = new Set();
        let scanned = 0;
        let addedThisBatch = 0;
        const chunkSize = 100;

        console.log(`🔎 Megapack: analisando ${batch.length} mensagens históricas em lotes...`);

        for (let start = 0; start < batch.length; start += chunkSize) {
            const chunk = batch.slice(start, start + chunkSize);
            const found = [];

            for (const msg of chunk) {
                scanned++;
                const query = extractPackQuery(msg);
                if (query) {
                    batchCommands.add(query);
                    found.push(query);
                }
            }

            const addedInChunk = await rememberHistoricalPacks(found);
            addedThisBatch += addedInChunk;
            state.uniqueNamesAdded = (Number(state.uniqueNamesAdded) || 0) + addedInChunk;
            state.messagesScanned = (Number(state.messagesScanned) || 0) + chunk.length;
            state.commandsFound = (Number(state.commandsFound) || 0) + found.length;
            state.lastBatchAt = new Date().toISOString();
            state.isLatestHistoryBatch = Boolean(isLatest);
            state.lastBatchSize = batch.length;
            state.lastBatchProcessed = scanned;
            await writeScanState(state);

            // Cede o event loop para que mensagens e comandos normais continuem fluindo.
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        state.batches = (Number(state.batches) || 0) + 1;
        state.lastBatchProcessed = batch.length;
        state.lastBatchUniqueCommands = batchCommands.size;
        state.lastCompletedAt = new Date().toISOString();
        await writeScanState(state);

        console.log(`✅ Megapack: ${batch.length} mensagens analisadas; ${batchCommands.size} comandos .pack encontrados; ${addedThisBatch} nomes novos adicionados.`);
    });

    scanChain = operation.catch(error => {
        console.error("❌ Erro varrendo histórico para o megapack:", error);
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
