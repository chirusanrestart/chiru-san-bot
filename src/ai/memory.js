import fs from "node:fs/promises";
import path from "node:path";

const directory = path.resolve("src/data");
const file = path.join(directory, "memory.json");

// Serializa as operações para evitar que duas mensagens sobrescrevam
// a memória uma da outra durante leituras/gravações concorrentes.
let operationQueue = Promise.resolve();

function serialize(operation) {
    const current = operationQueue.then(operation, operation);
    operationQueue = current.catch(() => {});
    return current;
}

async function loadMemory() {
    await fs.mkdir(directory, { recursive: true });

    try {
        const content = await fs.readFile(file, "utf8");
        const parsed = JSON.parse(content);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await saveMemory({});
        return {};
    }
}

async function saveMemory(data) {
    await fs.mkdir(directory, { recursive: true });
    const temporaryFile = `${file}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(data, null, 2));
    await fs.rename(temporaryFile, file);
}

export async function getUserMemory(id) {
    return serialize(async () => {
        const memory = await loadMemory();

        if (!memory[id]) {
            memory[id] = { history: [] };
            await saveMemory(memory);
        }

        return memory[id];
    });
}

export async function saveUserMessage(id, user, ai) {
    return serialize(async () => {
        const memory = await loadMemory();

        if (!memory[id]) {
            memory[id] = { history: [] };
        }

        if (!Array.isArray(memory[id].history)) {
            memory[id].history = [];
        }

        memory[id].history.push({
            user,
            ai,
            date: Date.now()
        });

        // Mantém somente as últimas 10 mensagens.
        memory[id].history = memory[id].history.slice(-10);

        await saveMemory(memory);
    });
}
