const SECURITY_RESPONSE = "Não vou fazer isso.";

const BLOCKED_TERMS = [
    "hitler", "adolf hitler", "nazismo", "nazista", "nazistas", "nazi",
    "nazis", "third reich", "terceiro reich", "reich", "gestapo",
    "schutzstaffel", "waffen ss", "ss nazi", "heil hitler", "sieg heil",
    "suastica nazi", "suastica nazista", "propaganda nazista",
    "propaganda nazi", "simbolo nazista", "simbolo nazi",
    "supremacia ariana", "aryan supremacy", "nazi propaganda"
];

const POLITICAL_ROLES = [
    "politico", "politica", "politicos", "politicas", "politician",
    "politicians", "presidente", "presidencia", "senador", "senadora",
    "senate", "deputado", "deputada", "congressista", "governador",
    "governadora", "prefeito", "prefeita", "vereador", "vereadora",
    "ministro", "ministra", "candidato", "candidata", "candidatura",
    "eleicao", "eleicoes", "eleitoral", "eleitor", "partido politico",
    "campanha politica", "campanha eleitoral", "political party",
    "political campaign", "candidate", "election", "elections"
];

const POLITICAL_NAMES = [
    "luiz inacio lula da silva", "lula", "jair messias bolsonaro",
    "jair bolsonaro", "bolsonaro", "fernando collor", "collor",
    "dilma rousseff", "dilma", "michel temer", "temer",
    "fernando henrique cardoso", "fhc", "itamar franco",
    "getulio vargas", "getulio", "juscelino kubitschek", "jk",
    "joao goulart", "jose sarney", "sarney", "tancredo neves",
    "ulysses guimaraes", "eduardo cunha", "arthur lira", "rodrigo maia",
    "alexandre de moraes", "dias toffoli", "gilmar mendes", "luiz fux",
    "carmen lucia", "flavio dino", "geraldo alckmin", "alckmin",
    "simone tebet", "marina silva", "carlos bolsonaro",
    "eduardo bolsonaro", "flavio bolsonaro", "nikolas ferreira",
    "tabata amaral", "guilherme boulos", "boulos", "ronaldo caiado",
    "romeu zema", "ratinho junior", "tarcisio de freitas",
    "ciro gomes", "kim kataguiri", "erika hilton", "manuela davila",
    "joao campos", "ricardo nunes", "donald trump", "trump", "joe biden",
    "barack obama", "obama", "kamala harris", "hillary clinton",
    "bill clinton", "george bush", "george w bush", "george h w bush",
    "ronald reagan", "richard nixon", "john f kennedy", "kennedy",
    "abraham lincoln", "franklin roosevelt", "justin trudeau",
    "emmanuel macron", "macron", "marine le pen", "angela merkel",
    "olaf scholz", "vladimir putin", "putin", "volodymyr zelensky",
    "zelensky", "recep tayyip erdogan", "erdogan", "xi jinping",
    "narendra modi", "modi", "shinzo abe", "fumio kishida",
    "benjamin netanyahu", "netanyahu", "nelson mandela",
    "margaret thatcher", "tony blair", "boris johnson", "keir starmer",
    "winston churchill", "fidel castro", "hugo chavez",
    "augusto pinochet", "muammar gaddafi", "saddam hussein"
];

const STOPWORDS = new Set([
    "a","o","as","os","um","uma","uns","umas","de","da","do","das","dos",
    "e","em","no","na","nos","nas","para","por","com","sem","the","an",
    "of","and","in","on","for","with","from","pack","sticker","stickers",
    "fig","figs","figurinha","figurinhas","imagem","imagens","foto","fotos"
]);

const GENERIC_ANIME = new Set([
    "anime","manga","character","personagem","characters","personagens",
    "girl","girls","boy","boys","female","male","waifu","husbando"
]);

const GENERIC_BAD_RESULTS = [
    "anime girl", "anime girls", "anime woman", "anime female", "waifu",
    "original character", "original_character", "random anime",
    "random girl", "cute anime girl"
];

function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toLowerCase()
        .replace(/[@]/g, "a")
        .replace(/[3]/g, "e")
        .replace(/[1!|]/g, "i")
        .replace(/[0]/g, "o")
        .replace(/[$5]/g, "s")
        .replace(/[7]/g, "t")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\\s+/g, " ")
        .trim();
}

function compact(value) {
    return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function findBlocked(text, list) {
    const normalized = normalizeText(text);
    const packed = compact(text);

    for (const term of list) {
        const n = normalizeText(term);
        if (normalized.includes(n)) return term;

        const c = compact(term);
        if (c.length >= 5 && packed.includes(c)) return term;
    }

    return null;
}

export function validatePackRequest(query) {
    const extremist = findBlocked(query, BLOCKED_TERMS);
    if (extremist) {
        return { blocked: true, reason: "extremist_or_nazi", match: extremist };
    }

    const politician = findBlocked(query, POLITICAL_NAMES);
    if (politician) {
        return { blocked: true, reason: "political_name", match: politician };
    }

    const politicalRequest = findBlocked(query, POLITICAL_ROLES);
    if (politicalRequest) {
        return { blocked: true, reason: "political_request", match: politicalRequest };
    }

    return { blocked: false, reason: null, match: null };
}

export function buildPackProfile(query) {
    const normalized = normalizeText(query);
    const tokens = normalized.split(" ").filter(Boolean);
    const expectedTokens = tokens.filter(
        token =>
            !STOPWORDS.has(token) &&
            !GENERIC_ANIME.has(token) &&
            token.length >= 2
    );

    return {
        query: String(query ?? "").trim(),
        normalized,
        compactQuery: compact(query),
        tokens,
        expectedTokens,
        isGenericAnimeRequest:
            expectedTokens.length === 0 &&
            tokens.some(token => GENERIC_ANIME.has(token)),
        minScore: expectedTokens.length <= 1 ? 34 : 42
    };
}

function hasToken(text, token) {
    return normalizeText(text)
        .split(" ")
        .includes(token) ||
        normalizeText(text).includes(token);
}

export function scorePackCandidate(item, profile) {
    const metadata = [
        item?.title,
        item?.description,
        item?.filename,
        item?.character,
        item?.animeName,
        item?.artistName,
        item?.tags,
        item?.keywords,
        item?.sourceUrl,
        item?.pageUrl,
        item?.pinUrl,
        item?.url
    ].filter(Boolean).join(" ");

    const normalizedMetadata = normalizeText(metadata);
    const compactMetadata = compact(metadata);

    let score = 0;
    const matched = [];

    for (const token of profile.expectedTokens) {
        if (hasToken(normalizedMetadata, token)) {
            score += /\\d/.test(token) ? 30 : 18;
            matched.push(token);
        }
    }

    if (
        profile.expectedTokens.length > 1 &&
        profile.expectedTokens.every(token =>
            hasToken(normalizedMetadata, token)
        )
    ) {
        score += 24;
    }

    if (
        profile.compactQuery.length >= 4 &&
        compactMetadata.includes(profile.compactQuery)
    ) {
        score += 22;
    }

    const genericBad = GENERIC_BAD_RESULTS.find(term =>
        normalizedMetadata.includes(normalizeText(term))
    );

    if (
        genericBad &&
        !profile.isGenericAnimeRequest &&
        matched.length === 0
    ) {
        score -= 45;
    }

    if (
        profile.expectedTokens.length > 0 &&
        matched.length === 0
    ) {
        score -= 15;
    }

    if (item?.source === "google-photos" && item?.character) {
        const character = normalizeText(item.character);

        if (character === profile.normalized) {
            score += 60;
        } else if (
            profile.expectedTokens.some(token =>
                hasToken(character, token)
            )
        ) {
            score += 20;
        } else {
            score -= 35;
        }
    }

    if (item?.source === "nekosbest" && item?.animeName) {
        const anime = normalizeText(item.animeName);
        if (
            profile.expectedTokens.some(token =>
                anime.includes(token)
            )
        ) {
            score += 12;
        }
    }

    if (Array.isArray(item?.tags)) {
        for (const token of profile.expectedTokens) {
            if (hasToken(item.tags.join(" "), token)) {
                score += 12;
            }
        }
    }

    return {
        ...item,
        matchScore: score,
        matchData: { matched, metadata: normalizedMetadata }
    };
}

export function filterPackCandidates(candidates, profile) {
    const scored = candidates
        .map(item => scorePackCandidate(item, profile))
        .sort((a, b) => b.matchScore - a.matchScore);

    if (profile.isGenericAnimeRequest) {
        return scored.filter(item => item.matchScore >= 10);
    }

    return scored.filter(
        item => item.matchScore >= profile.minScore
    );
}

export function validateCandidateSet(candidates, profile) {
    if (!candidates.length) {
        return { accepted: false, reason: "no_candidates", good: 0, total: 0, ratio: 0 };
    }

    const good = filterPackCandidates(candidates, profile);
    const ratio = good.length / candidates.length;

    if (
        profile.expectedTokens.length > 0 &&
        candidates.length >= 20 &&
        ratio < 0.12
    ) {
        return {
            accepted: false,
            reason: "source_mismatch",
            good: good.length,
            total: candidates.length,
            ratio
        };
    }

    return {
        accepted: good.length > 0,
        reason: good.length ? "ok" : "no_reliable_match",
        good: good.length,
        total: candidates.length,
        ratio
    };
}

export { SECURITY_RESPONSE };
