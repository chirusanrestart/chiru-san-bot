import fs from "fs/promises";
import path from "path";
import { fetchImageUrls } from "@marcus5914/google-photos-album-image-url-fetch";

const CONFIG_FILE = path.resolve(process.cwd(), "google-photos-albums.json");
const CONCURRENCY = 6;

function normalizeText(text) {
    return String(text ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function filenameFromHeader(value) {
    if (!value) return null;

    const utf8 = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);

    if (utf8?.[1]) {
        try {
            return decodeURIComponent(
                utf8[1].trim().replace(/^"|"$/g, "")
            );
        } catch {}
    }

    const plain = value.match(/filename\s*=\s*"([^"]+)"/i);

    if (plain?.[1]) {
        return plain[1].trim();
    }

    const bare = value.match(/filename\s*=\s*([^;]+)/i);

    return bare?.[1]?.trim().replace(/^"|"$/g, "") || null;
}

function characterFromFilename(filename) {
    if (!filename) return null;

    let name = path.basename(String(filename));

    name = name.replace(
        /\.(?:jpe?g|png|webp|gif|bmp|avif|heic|heif|mp4|mov|m4v|webm)$/i,
        ""
    );

    name = name.replace(
        /\s*\(\d+\)\s*$/,
        ""
    );

    return normalizeText(name) || null;
}

async function getFilename(url) {
    if (!url) return null;

    try {
        let response = await fetch(url, {
            method: "HEAD",
            headers: {
                "User-Agent": "Chiru-san-Bot/1.0"
            }
        });

        let filename =
            filenameFromHeader(
                response.headers.get("content-disposition")
            );

        if (filename) return filename;

        if (response.status === 405 || response.status === 501) {
            response = await fetch(url, {
                headers: {
                    "User-Agent": "Chiru-san-Bot/1.0",
                    Range: "bytes=0-0"
                }
            });

            filename =
                filenameFromHeader(
                    response.headers.get("content-disposition")
                );

            try {
                await response.body?.cancel();
            } catch {}
        }

        return filename;
    } catch {
        return null;
    }
}

async function loadConfig() {
    const content =
        await fs.readFile(
            CONFIG_FILE,
            "utf8"
        );

    const data =
        JSON.parse(content);

    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        typeof data.url !== "string" ||
        !data.url.trim()
    ) {
        throw new Error(
            'google-photos-albums.json precisa conter { "url": "LINK_DO_ALBUM_MESTRE" }'
        );
    }

    if (
        data.url.includes("COLE_AQUI") ||
        data.url.includes("SEU_ALBUM")
    ) {
        throw new Error(
            "O link do álbum mestre ainda não foi configurado em google-photos-albums.json"
        );
    }

    return data.url.trim();
}

async function enrichItems(items) {
    const results = [];
    let index = 0;

    async function worker() {
        while (index < items.length) {
            const item = items[index++];

            if (!item?.url) {
                continue;
            }

            const baseUrl =
                item.isVideo && item.videoUrl
                    ? item.videoUrl
                    : item.url;

            const filenameUrl =
                item.isVideo && item.videoUrl
                    ? item.videoUrl
                    : baseUrl + "=d";

            const filename =
                await getFilename(
                    filenameUrl
                );

            const character =
                characterFromFilename(
                    filename
                );

            if (!character) {
                continue;
            }

            results.push({
                url:
                    item.isVideo && item.videoUrl
                        ? item.videoUrl
                        : baseUrl +
                          "=w" +
                          item.width +
                          "-h" +
                          item.height,

                source:
                    "google-photos",

                animated:
                    item.isVideo === true ||
                    /\.(?:gif)(?:[?#]|$)/i.test(
                        String(filename)
                    ),

                filename,
                character,
                uid: item.uid,
                width: item.width,
                height: item.height
            });
        }
    }

    await Promise.all(
        Array.from(
            {
                length:
                    Math.min(
                        CONCURRENCY,
                        Math.max(
                            items.length,
                            1
                        )
                    )
            },
            () => worker()
        )
    );

    return results;
}

export async function fetchMasterGooglePhotos() {
    const albumUrl =
        await loadConfig();

    const items =
        await fetchImageUrls(
            albumUrl
        );

    if (!items?.length) {
        return [];
    }

    return enrichItems(
        items
    );
}

export async function searchMasterGooglePhotos(
    query
) {
    const normalized =
        normalizeText(
            query
        );

    const all =
        await fetchMasterGooglePhotos();

    const matches =
        all.filter(
            item =>
                item.character ===
                normalized
        );

    console.log(
        "📸 Google Fotos mestre: " +
        matches.length +
        ' mídias para "' +
        query +
        '"'
    );

    return matches;
}

export async function listMasterGooglePhotos() {
    const all =
        await fetchMasterGooglePhotos();

    return [
        ...new Set(
            all
                .map(
                    item =>
                        item.character
                )
                .filter(Boolean)
        )
    ].sort(
        (a, b) =>
            a.localeCompare(
                b,
                "pt-BR"
            )
    );
}
