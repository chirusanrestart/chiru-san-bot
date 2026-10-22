import { isFilterEnabled } from "../services/filterSettings.js";

const BLOCKED_TOPIC_PATTERNS = {
    politica: [
        /\b(?:lula|luiz\s+inacio\s+lula|bolso|bolsonaro)\b/u,
        /\b(?:politica|politico|politica partidaria|eleicao|eleicoes|campanha eleitoral)\b/u
    ],
    religiao: [
        /\b(?:catolicismo|catolico|catolica|igreja catolica|cristianismo|cristao|crista|evangelico|evangelica|islamismo|islamico|islamica|religiao|ateismo|ateu|ateia)\b/u
    ],
    adulto: [
        /\b(?:18\s*mais|mais\s+18|r\s*18|nsfw|xxx|porn|porno|pornografia|pornografico|pornografica|pornhub|xvideos|xnxx|hentai|ecchi|rule\s*34|nude|nudes|nudez|onlyfans|sexo|sexual|sexualmente|erotico|erotica|erotismo|conteudo\s+adulto|conteudo\s+explicito|sexo\s+explicito|masturbacao|masturbar|fetiche|fetiches|bdsm|sexting|putaria|safadeza|prostituicao|prostituta|prostituto|camgirl|cam\s+girl|striptease|orgia|orgias)\b/u
    ],
    humorNegro: [
        /\b(?:humor negro|piada de humor negro|piadas de humor negro|humor macabro)\b/u
    ],
    nazismo: [
        /\b(?:nazismo|nazista|nazistas|nazi|nazis|adolf hitler|hitler|holocausto|suastica|terceiro reich)\b/u
    ]
};

function normalizeText(value) {
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

export function isBlockedTopic(message) {
    const original = String(message ?? "");
    const normalized = normalizeText(message);
    if (!normalized) return false;

    for (const [category, patterns] of Object.entries(BLOCKED_TOPIC_PATTERNS)) {
        if (!isFilterEnabled(category)) continue;
        if (
            category === "adulto" &&
            /(?:\+18\b|\b18\+|\br-?18\b|\b18\s*(?:mais|anos|adulto|explicito)\b)/i.test(original)
        ) return true;
        if (patterns.some(pattern => pattern.test(normalized))) return true;
    }

    return false;
}
