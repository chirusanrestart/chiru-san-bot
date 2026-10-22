const BLOCKED_TOPIC_PATTERNS = [
    // Política e figuras políticas
    /\b(?:lula|luiz\s+inacio\s+lula|bolso|bolsonaro)\b/u,
    /\b(?:politica|politico|politica partidaria|eleicao|eleicoes|campanha eleitoral)\b/u,

    // Religião e doutrinas religiosas
    /\b(?:catolicismo|catolico|catolica|igreja catolica|cristianismo|cristao|crista|evangelico|evangelica|islamismo|islamico|islamica|religiao|ateismo|ateu|ateia)\b/u,

    // Conteúdo pornográfico/adulto
    /\b(?:porno|pornografia|pornografico|pornografica|hentai|nudes|onlyfans|sexo explicito|conteudo adulto)\b/u,
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
    const normalized = normalizeText(message);
    if (!normalized) return false;
    return BLOCKED_TOPIC_PATTERNS.some(pattern => pattern.test(normalized));
}
