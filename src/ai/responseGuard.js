const BLOCKED_TOPIC_PATTERNS = [
    // Política e figuras políticas
    /\b(?:lula|luiz\s+inacio\s+lula|bolso|bolsonaro)\b/u,
    /\b(?:politica|politico|politica partidaria|eleicao|eleicoes|campanha eleitoral)\b/u,

    // Religião e doutrinas religiosas
    /\b(?:catolicismo|catolico|catolica|igreja catolica|cristianismo|cristao|crista|evangelico|evangelica|islamismo|islamico|islamica|religiao|ateismo|ateu|ateia)\b/u,

    // Conteúdo +18, sexual ou pornográfico
    /\b(?:18\s*mais|mais\s+18|r\s*18|nsfw|xxx|porn|porno|pornografia|pornografico|pornografica|pornhub|xvideos|xnxx|hentai|ecchi|rule\s*34|nude|nudes|nudez|onlyfans|sexo|sexual|sexualmente|erotico|erotica|erotismo|conteudo\s+adulto|conteudo\s+explicito|sexo\s+explicito|masturbacao|masturbar|fetiche|fetiches|bdsm|sexting|putaria|safadeza|prostituicao|prostituta|prostituto|camgirl|cam\s+girl|striptease|orgia|orgias)\b/u,

    // Humor negro e piadas desse tipo
    /\b(?:humor negro|piada de humor negro|piadas de humor negro|humor macabro)\b/u,

    // Nazismo e referências diretamente associadas
    /\b(?:nazismo|nazista|nazistas|nazi|nazis|adolf hitler|hitler|holocausto|suastica|terceiro reich)\b/u,
];

function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

export function isBlockedTopic(message) {
    if (/(?:\\+18\\b|\\b18\\+|\\br-?18\\b)/i.test(String(message ?? ""))) return true;
    const normalized = normalizeText(message);
    if (!normalized) return false;
    return BLOCKED_TOPIC_PATTERNS.some(pattern => pattern.test(normalized));
}
