import fs from "node:fs/promises";
import path from "node:path";

const settingsPath = path.resolve(process.env.WELCOME_SETTINGS_FILE || "data/group-welcome.json");
let writeQueue = Promise.resolve();

async function readSettings() {
    try {
        const parsed = JSON.parse(await fs.readFile(settingsPath, "utf8"));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        if (error.code === "ENOENT") return {};
        throw error;
    }
}

async function saveSettings(settings) {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    const temporaryPath = settingsPath + ".tmp";
    await fs.writeFile(temporaryPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
    await fs.rename(temporaryPath, settingsPath);
}

export async function isWelcomeEnabled(groupJid) {
    if (typeof groupJid !== "string" || !groupJid.endsWith("@g.us")) return false;
    return (await readSettings())[groupJid] === true;
}

export async function setWelcomeEnabled(groupJid, enabled) {
    if (typeof groupJid !== "string" || !groupJid.endsWith("@g.us")) throw new Error("As boas-vindas só podem ser configuradas em grupos.");
    const operation = writeQueue.then(async () => {
        const settings = await readSettings();
        settings[groupJid] = Boolean(enabled);
        await saveSettings(settings);
    });
    writeQueue = operation.catch(() => {});
    await operation;
}
