import fs from "node:fs/promises";
import path from "node:path";

const statePath = path.resolve(
    process.env.COMMAND_LIMITS_FILE?.trim() || "data/command-limits.json"
);

let cachedLimits;
let loadPromise = null;
let writeQueue = Promise.resolve();

async function readLimits() {
    try {
        const raw = await fs.readFile(statePath, "utf8");
        const parsed = JSON.parse(raw);

        if (
            !parsed ||
            typeof parsed !== "object" ||
            Array.isArray(parsed)
        ) {
            throw new Error("O arquivo de limites precisa conter um objeto JSON.");
        }

        return parsed;
    } catch (error) {
        if (error.code === "ENOENT") return {};
        throw error;
    }
}

async function loadLimits() {
    if (!loadPromise) {
        loadPromise = readLimits()
            .then(limits => {
                cachedLimits = limits;
                return limits;
            })
            .catch(error => {
                loadPromise = null;
                throw error;
            });
    }

    return loadPromise;
}

async function saveLimits(limits) {
    await fs.mkdir(path.dirname(statePath), { recursive: true });

    const temporaryPath = `${statePath}.${process.pid}.tmp`;

    try {
        await fs.writeFile(
            temporaryPath,
            `${JSON.stringify(limits, null, 2)}\\n`,
            "utf8"
        );

        await fs.rename(temporaryPath, statePath);
    } catch (error) {
        await fs.unlink(temporaryPath).catch(() => {});
        throw error;
    }
}

function normalizeCommandName(commandName) {
    if (typeof commandName !== "string") return "";

    return commandName
        .trim()
        .replace(/^\\./, "")
        .toLowerCase();
}

export async function isCommandEnabled(groupJid, commandName) {
    if (
        typeof groupJid !== "string" ||
        !groupJid.endsWith("@g.us")
    ) {
        return true;
    }

    const normalizedName = normalizeCommandName(commandName);
    if (!normalizedName) return true;

    const limits = await loadLimits();
    const groupLimits = limits[groupJid];

    if (
        !groupLimits ||
        typeof groupLimits !== "object" ||
        Array.isArray(groupLimits)
    ) {
        return true;
    }

    return groupLimits[normalizedName] !== false;
}

export async function setCommandEnabled(
    groupJid,
    commandName,
    enabled
) {
    if (
        typeof groupJid !== "string" ||
        !/^\\d+(?:-\\d+)?@g\\.us$/.test(groupJid)
    ) {
        throw new Error("O identificador informado não é um JID de grupo.");
    }

    const normalizedName = normalizeCommandName(commandName);

    if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalizedName)) {
        throw new Error("Nome do comando inválido.");
    }

    const operation = writeQueue.then(async () => {
        const current = await loadLimits();
        const previousGroup = current[groupJid];

        const groupLimits =
            previousGroup &&
            typeof previousGroup === "object" &&
            !Array.isArray(previousGroup)
                ? previousGroup
                : {};

        const next = {
            ...current,
            [groupJid]: {
                ...groupLimits,
                [normalizedName]: Boolean(enabled)
            }
        };

        await saveLimits(next);

        cachedLimits = next;
        loadPromise = Promise.resolve(next);
    });

    writeQueue = operation.catch(() => {});
    await operation;
}

export async function getGroupCommandLimits(groupJid) {
    const limits = await loadLimits();
    const groupLimits = limits[groupJid];

    if (
        !groupLimits ||
        typeof groupLimits !== "object" ||
        Array.isArray(groupLimits)
    ) {
        return {};
    }

    return { ...groupLimits };
}
