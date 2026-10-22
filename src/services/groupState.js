import fs from "node:fs/promises";
import path from "node:path";

const statePath = path.resolve("data/group-states.json");
let writeQueue = Promise.resolve();

async function readStates() {
    try {
        const raw = await fs.readFile(statePath, "utf8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        if (error.code === "ENOENT") return {};
        console.error("❌ Não consegui ler os estados dos grupos:", error?.message || error);
        return {};
    }
}

async function saveStates(states) {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(states, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, statePath);
}

export async function isGroupEnabled(groupJid) {
    if (typeof groupJid !== "string" || !groupJid.endsWith("@g.us")) return true;
    const states = await readStates();
    return states[groupJid] !== false;
}

export async function setGroupEnabled(groupJid, enabled) {
    if (typeof groupJid !== "string" || !groupJid.endsWith("@g.us")) {
        throw new Error("O estado só pode ser alterado dentro de um grupo.");
    }

    const operation = writeQueue.then(async () => {
        const states = await readStates();
        states[groupJid] = Boolean(enabled);
        await saveStates(states);
    });

    writeQueue = operation.catch(() => {});
    await operation;
}
