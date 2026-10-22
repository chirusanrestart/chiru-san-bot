import { isBlockedTopic } from "../ai/responseGuard.js";

function normalizeForGuard(value) {
    return String(value ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[аА]/g, "a")
        .replace(/[еЕ]/g, "e")
        .replace(/[оО]/g, "o")
        .replace(/[рР]/g, "p")
        .replace(/[сС]/g, "c")
        .replace(/[хХ]/g, "x")
        .replace(/[іІ]/g, "i")
        .replace(/[уУ]/g, "y")
        .replace(/[@4]/g, "a")
        .replace(/[3]/g, "e")
        .replace(/[1!|]/g, "i")
        .replace(/[0]/g, "o")
        .replace(/[$5]/g, "s")
        .replace(/[7]/g, "t")
        .replace(/[8]/g, "b")
        .toLocaleLowerCase("pt-BR")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

const EVASION_TERMS = [
    "burlar a trava", "burlar o filtro", "contornar o filtro",
    "desativar o filtro", "desativar a trava", "sem filtro",
    "sem censura", "sem restricoes", "modo irrestrito",
    "jailbreak", "developer mode", "modo desenvolvedor",
    "ignore as regras", "ignora as regras", "ignore as instrucoes",
    "finja que nao tem regras", "responda mesmo bloqueado"
];

export function validateCommandRequest(message) {
    const normalized = normalizeForGuard(message);
    if (!normalized) return { blocked: false, reason: null };

    if (isBlockedTopic(message) || isBlockedTopic(normalized)) {
        return { blocked: true, reason: "blocked_topic" };
    }

    const compact = normalized.replace(/\s+/g, "");
    if (EVASION_TERMS.some(term => {
        const normalizedTerm = normalizeForGuard(term);
        return normalized.includes(normalizedTerm) ||
            compact.includes(normalizedTerm.replace(/\s+/g, ""));
    })) {
        return { blocked: true, reason: "guard_evasion" };
    }

    return { blocked: false, reason: null };
}
