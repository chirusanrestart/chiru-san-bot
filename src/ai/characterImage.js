// Resolve imagens para personagens sem imageUrl estático.
// Prioriza Jikan e usa Wikimedia Commons como alternativa.
// Links encontrados ficam em cache persistente para sobreviver a reinicializações.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const imageCache = new Map();
const cachePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/character-image-cache.json");
let diskCachePromise;

function normalize(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("en")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

async function loadDiskCache() {
    if (!diskCachePromise) {
        diskCachePromise = readFile(cachePath, "utf8")
            .then(content => JSON.parse(content))
            .catch(() => ({}));
    }
    return diskCachePromise;
}

async function saveDiskCache(characterId, imageUrl) {
    try {
        const cache = await loadDiskCache();
        cache[characterId] = imageUrl;
        await mkdir(path.dirname(cachePath), { recursive: true });
        const temporaryPath = cachePath + ".tmp";
        await writeFile(temporaryPath, JSON.stringify(cache, null, 2) + "\n", "utf8");
        await rename(temporaryPath, cachePath);
        diskCachePromise = Promise.resolve(cache);
    } catch (error) {
        console.warn("Não consegui salvar o cache persistente de imagens:", error?.message || error);
    }
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
    const searchName = String(character.name || "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
    const query = encodeURIComponent(searchName);
    const result = await fetchJson("https://api.jikan.moe/v4/characters?q=" + query + "&limit=5");
    const wanted = normalize(searchName);
    const entries = result?.data || [];
    const match = entries.find(item => normalize(item.name) === wanted);
    return match?.images?.webp?.image_url || match?.images?.jpg?.image_url || null;
}

async function fromCommons(character) {
    const query = encodeURIComponent('filetype:bitmap "' + character.name + '"');
    const url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=" +
        query + "&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json";
    const result = await fetchJson(url);
    const pages = Object.values(result?.query?.pages || {});
    const wanted = normalize(character.name);
    if (!wanted) return null;

    const scored = pages.map(page => {
        const title = normalize(String(page.title || "").replace(/^file /, ""));
        const score = title === wanted ? 3 :
            title.startsWith(wanted + " ") || title.endsWith(" " + wanted) ? 2 :
            title.includes(wanted) ? 1 : 0;
        return { page, score };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);

    const imageInfo = scored[0]?.page?.imageinfo?.[0];
    return imageInfo?.thumburl || imageInfo?.url || null;
}

export async function resolveCharacterImage(character) {
    if (character?.imageUrl) return character.imageUrl;
    if (!character?.id) return null;

    if (imageCache.has(character.id)) return imageCache.get(character.id);

    const promise = (async () => {
        const stored = (await loadDiskCache())[character.id];
        if (typeof stored === "string" && /^https?:\/\//i.test(stored)) return stored;

        let image = null;
        try {
            image = await fromJikan(character);
        } catch (error) {
            console.warn("Busca de imagem no Jikan falhou:", error?.message || error);
        }

        if (!image) {
            try {
                image = await fromCommons(character);
            } catch (error) {
                console.warn("Busca de imagem no Wikimedia Commons falhou:", error?.message || error);
            }
        }

        if (image) await saveDiskCache(character.id, image);
        return image;
    })();

    imageCache.set(character.id, promise);
    const image = await promise;
    imageCache.set(character.id, image);
    return image;
}
