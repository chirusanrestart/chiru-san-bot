import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const HISTORY_FILE = path.join(DATA_DIR, "megapack-history.json");
let writeChain = Promise.resolve();

async function readHistory() {
    try {
        const raw = await fs.readFile(HISTORY_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch (error) {
        if (error.code === "ENOENT") return {};
        throw error;
    }
}

export async function rememberMegapack({ jid, chatJid, query, requester }) {
    if (!jid || !query) return;
    const normalized = String(query).trim();
    if (!normalized) return;

    const operation = writeChain.then(async () => {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const history = await readHistory();
        const key = String(jid);
        const entry = history[key] ||= {
            requester: String(requester || "usuário"),
            packs: []
        };
        entry.requester = String(requester || entry.requester || "usuário");
        const existing = entry.packs.find(
            pack => pack.name.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR")
        );
        if (existing) {
            existing.lastRequestedAt = new Date().toISOString();
            existing.chatJid = String(chatJid || existing.chatJid || "");
        } else {
            entry.packs.push({
                name: normalized,
                firstRequestedAt: new Date().toISOString(),
                lastRequestedAt: new Date().toISOString(),
                chatJid: String(chatJid || "")
            });
        }
        await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2) + "\n", "utf8");
    });
    writeChain = operation.catch(() => {});
    return operation;
}

export async function getMegapackHistory(jid) {
    await writeChain;
    const history = await readHistory();
    return history[String(jid)]?.packs || [];
}
