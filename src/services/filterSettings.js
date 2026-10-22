import fs from "node:fs";
import path from "node:path";

const statePath = path.resolve("data/filter-settings.json");

// Categorias críticas ficam ativas mesmo quando o dono desliga os filtros configuráveis.
export const LOCKED_FILTER_CATEGORIES = Object.freeze([
    "adulto",
    "assedio",
    "machismo",
    "nazismo",
    "catolicismo",
    "ortodoxia"
]);
const LOCKED_FILTER_SET = new Set(LOCKED_FILTER_CATEGORIES);
const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    categories: {
        politica: true,
        religiao: true,
        adulto: true,
        humorNegro: true,
        nazismo: true,
        machismo: true,
        catolicismo: true,
        ortodoxia: true,
        assedio: true
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
                    LOCKED_FILTER_SET.has(key) ? true : categories[key] !== false
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

let cachedSettings = readSettings();

export function getFilterSettings() {
    return { enabled: cachedSettings.enabled, categories: { ...cachedSettings.categories } };
}

export function isFilterEnabled(category) {
    // Categorias críticas permanecem ativas mesmo quando o filtro global é desligado.
    if (LOCKED_FILTER_SET.has(category)) return true;
    if (!cachedSettings.enabled) return false;
    if (!category) return true;
    return cachedSettings.categories[category] !== false;
}

export function updateFilterSettings(mutator) {
    const current = getFilterSettings();
    const next = {
        enabled: current.enabled,
        categories: { ...current.categories }
    };
    mutator(next);
    for (const category of LOCKED_FILTER_CATEGORIES) next.categories[category] = true;
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, statePath);
    cachedSettings = next;
    return getFilterSettings();
}

export const FILTER_CATEGORIES = Object.freeze({
    politica: "Política",
    religiao: "Religião",
    adulto: "Conteúdo +18",
    humorNegro: "Humor negro",
    nazismo: "Nazismo e símbolos associados",
    machismo: "Machismo e ataques contra homens/mulheres",
    catolicismo: "Ataques contra o catolicismo",
    ortodoxia: "Ataques contra cristãos ortodoxos",
    assedio: "Assédio e humilhação"
});
