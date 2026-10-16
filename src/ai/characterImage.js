// Resolve imagens para personagens sem imageUrl estático.
// Prioriza a base de personagens de anime do Jikan e usa Wikimedia Commons como alternativa.
// Resultados ficam em cache durante a execução para evitar consultas repetidas.
const imageCache = new Map();

function normalize(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("en")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

async function fetchJson(url, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "ChiruSanBot/1.0 (character image lookup)" }
        });
        if (!response.ok) return null;
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

async function fromJikan(character) {
    const query = encodeURIComponent(character.name);
    const result = await fetchJson(`https://api.jikan.moe/v4/characters?q=${query}&limit=5`);
    const wanted = normalize(character.name);
    const entries = result?.data || [];
    const match = entries.find(item => {
        const candidate = normalize(item.name);
        return candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate);
    });
    return match?.images?.jpg?.image_url || match?.images?.webp?.image_url || null;
}

async function fromCommons(character) {
    const query = encodeURIComponent(`filetype:bitmap "${character.name}"`);
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json`;
    const result = await fetchJson(url);
    const pages = Object.values(result?.query?.pages || {});
    const wanted = normalize(character.name);
    const match = pages.find(page => {
        const title = normalize(String(page.title || "").replace(/^file /, ""));
        return title.includes(wanted) || wanted.split(" ").filter(Boolean).length > 1 &&
            wanted.split(" ").filter(Boolean).every(token => title.includes(token));
    });
    return match?.imageinfo?.[0]?.thumburl || match?.imageinfo?.[0]?.url || null;
}

export async function resolveCharacterImage(character) {
    if (character?.imageUrl) return character.imageUrl;
    if (!character?.id) return null;
    if (imageCache.has(character.id)) return imageCache.get(character.id);

    const promise = (async () => {
        try {
            const image = await fromJikan(character);
            if (image) return image;
        } catch (error) {
            console.warn("Busca de imagem no Jikan falhou:", error?.message || error);
        }
        try {
            return await fromCommons(character);
        } catch (error) {
            console.warn("Busca de imagem no Wikimedia Commons falhou:", error?.message || error);
            return null;
        }
    })();

    imageCache.set(character.id, promise);
    const image = await promise;
    imageCache.set(character.id, image);
    return image;
}
