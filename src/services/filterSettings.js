import fs from "node:fs";
import path from "node:path";

const statePath = path.resolve("data/filter-settings.json");
const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    categories: {
        politica: true,
        religiao: true,
        adulto: true,
        humorNegro: true,
        nazismo: true
    }
});

function readSettings() {
    try {
        const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
        const categories = parsed?.categories && typeof parsed.categories === "object"
            ? parsed.categories
            : {};
        return {
            enabled: parsed?.enabled !== false,
            categories: Object.fromEntries(
                Object.keys(DEFAULT_SETTINGS.categories).map(key => [
                    key,
                    categories[key] !== false
                ])
            )
        };
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("❌ Não consegui ler as configurações do filtro:", error.message);
        }
        return {
            enabled: DEFAULT_SETTINGS.enabled,
            categories: { ...DEFAULT_SETTINGS.categories }
        };
    }
}

export function getFilterSettings() {
    const settings = readSettings();
    return { enabled: settings.enabled, categories: { ...settings.categories } };
}

export function isFilterEnabled(category) {
    const settings = readSettings();
    if (!settings.enabled) return false;
    if (!category) return true;
    return settings.categories[category] !== false;
}

export function updateFilterSettings(mutator) {
    const current = readSettings();
    const next = {
        enabled: current.enabled,
        categories: { ...current.categories }
    };
    mutator(next);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, statePath);
    return getFilterSettings();
}

export const FILTER_CATEGORIES = Object.freeze({
    politica: "Política",
    religiao: "Religião",
    adulto: "Conteúdo +18",
    humorNegro: "Humor negro",
    nazismo: "Nazismo e símbolos associados"
});
