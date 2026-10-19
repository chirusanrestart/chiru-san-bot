import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const HISTORY_FILE = path.join(DATA_DIR, "megapack-history.json");
let writeChain = Promise.resolve();

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

export async function rememberMegapack({ query }) {
    const normalized = String(query || "").trim();
    if (!normalized) return;

    const operation = writeChain.then(async () => {
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
    writeChain = operation.catch(() => {});
    return operation;
}

export async function getMegapackHistory() {
    await writeChain;
    const history = await readHistory();
    return history.packs || [];
}
