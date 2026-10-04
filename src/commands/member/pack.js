import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";

import { sendStickerPack } from "../../services/stickerPack.js";
import { fetchImageUrls } from "@marcus5914/google-photos-album-image-url-fetch";

const execFileAsync = promisify(execFile);

const TOTAL_STICKERS = 60;
const CONCURRENCY = 3;

const MAX_CANDIDATES = 180;
const MAX_SEARCH_PAGES = 5;
const MAX_SAFEBOORU = 120;
const MAX_WIKIMEDIA = 60;

const TARGET_STATIC = 30;
const TARGET_ANIMATED = 30;

const MAX_OTAKUGIFS = 30;
const MAX_NEKOSBEST_STATIC = 20;
const MAX_NEKOSBEST_ANIMATED = 20;

const MIN_DELAY = 100;
const MAX_DELAY = 200;

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const MAX_STICKER_SIZE = 1 * 1024 * 1024;

const GOOGLE_PHOTOS_FILE = path.resolve(
    process.cwd(),
    "google-photos-albums.json"
);

const WIKIMEDIA_API =
    "https://commons.wikimedia.org/w/api.php";

async function run(
    command,
    args,
    options = {}
) {
    return execFileAsync(
        command,
        args,
        {
            maxBuffer:
                32 * 1024 * 1024,
            ...options
        }
    );
}

function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}

function randomDelay(
    min,
    max
) {
    return Math.floor(
        Math.random() *
        (max - min + 1)
    ) + min;
}

function shuffle(array) {
    return [...array].sort(
        () => Math.random() - 0.5
    );
}

function normalizeText(text) {
    return text
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .replace(
            /[^a-z0-9]+/g,
            " "
        )
        .trim()
        .replace(
            /\s+/g,
            " "
        );
}

function toBooruTag(text) {
    return normalizeText(text)
        .replace(
            /\s+/g,
            "_"
        );
}

function looksAnimatedUrl(url) {
    return /\.(?:gif)(?:[?#]|$)/i.test(
        String(url ?? "")
    );
}

function shouldUseWikimedia(query) {
    const normalized = normalizeText(query).replace(/\s+/g, " ");

    const safeTerms = [
        "animal", "cat", "dog", "bird", "fish", "flower", "tree",
        "nature", "landscape", "ocean", "sea", "mountain", "space",
        "planet", "moon", "sun", "food", "pizza", "cake", "car",
        "airplane", "ship", "city", "building", "flag", "map",
        "logo", "computer", "phone"
    ];

    return safeTerms.includes(normalized);
}

async function loadGooglePhotosAlbums() {
    try {
        const content =
            await fs.readFile(
                GOOGLE_PHOTOS_FILE,
                "utf8"
            );

        const data =
            JSON.parse(
                content
            );

        if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data)
        ) {
            return {};
        }

        return data;
    } catch (err) {
        if (
            err.code !== "ENOENT"
        ) {
            console.log(
                `⚠️ Falha ao carregar álbuns: ${err.message}`
            );
        }

        return {};
    }
}

async function findGooglePhotosAlbum(
    query
) {
    const albums =
        await loadGooglePhotosAlbums();

    const normalizedQuery =
        normalizeText(
            query
        );

    for (
        const [name, url]
        of Object.entries(albums)
    ) {
        if (
            normalizeText(name) ===
            normalizedQuery
        ) {
            return {
                name,
                url
            };
        }
    }

    for (
        const [name, url]
        of Object.entries(albums)
    ) {
        const normalizedName =
            normalizeText(
                name
            );

        if (
            normalizedName.includes(
                normalizedQuery
            ) ||
            normalizedQuery.includes(
                normalizedName
            )
        ) {
            return {
                name,
                url
            };
        }
    }

    return null;
}

async function searchGooglePhotos(
    query
) {
    const album =
        await findGooglePhotosAlbum(
            query
        );

    if (!album) {
        console.log(
            `📸 Google Fotos: nenhum álbum para "${query}"`
        );
        return [];
    }

    console.log(
        `📸 Google Fotos: álbum → ${album.name}`
    );

    try {
        const items =
            await fetchImageUrls(
                album.url
            );

        if (
            !items?.length
        ) {
            console.log(
                "⚠️ Google Fotos: álbum vazio"
            );
            return [];
        }

        const images =
            items
                .filter(
                    item =>
                        item &&
                        item.url &&
                        !item.isVideo
                )
                .map(
                    item => {
                        let url =
                            item.url;

                        if (
                            item.width &&
                            item.height &&
                            !url.includes("=")
                        ) {
                            url =
                                `${url}=w${item.width}-h${item.height}`;
                        }

                        return {
                            url,
                            source:
                                "google-photos",
                            animated:
                                looksAnimatedUrl(url)
                        };
                    }
                );

        console.log(
            `📸 Google Fotos: ${images.length} imagens`
        );

        return shuffle(
            images
        );
    } catch (err) {
        console.log(
            `⚠️ Google Fotos falhou: ${err.message}`
        );
        return [];
    }
}

async function searchNekosBest(query) {
    const results = [];

    async function search(type, amount) {
        const params = new URLSearchParams({
            query,
            type: String(type),
            amount: String(Math.min(amount, 20))
        });

        try {
            const response = await fetch(
                `https://nekos.best/api/v2/search?${params.toString()}`,
                {
                    headers: {
                        "User-Agent":
                            "Chiru-san-Bot (https://github.com/chirusanrestart/chiru-san-bot)"
                    }
                }
            );

            if (!response.ok) {
                console.log(`⚠️ NekosBest HTTP ${response.status} (type=${type})`);
                return;
            }

            const data = await response.json();
            if (!Array.isArray(data?.results)) return;

            for (const item of data.results) {
                if (!item?.url) continue;
                results.push({
                    url: item.url,
                    source: "nekosbest",
                    animated: type === 2 || looksAnimatedUrl(item.url),
                    animeName: item.anime_name,
                    artistName: item.artist_name,
                    sourceUrl: item.source_url,
                    width: item.dimensions?.width,
                    height: item.dimensions?.height
                });
            }
        } catch (err) {
            console.log(`⚠️ NekosBest erro (type=${type}): ${err.message}`);
        }
    }

    await search(1, MAX_NEKOSBEST_STATIC);
    await search(2, MAX_NEKOSBEST_ANIMATED);

    console.log(`🐱 NekosBest: ${results.length} resultados para "${query}"`);
    return shuffle(results);
}

async function searchOtakuGifs(query, limit = MAX_OTAKUGIFS) {
    try {
        const normalizedQuery = normalizeText(query).replace(/\s+/g, "");

        const reactionsResponse = await fetch(
            "https://api.otakugifs.xyz/gif/allreactions",
            {
                headers: {
                    "User-Agent": "chiru-san-bot/1.0"
                }
            }
        );

        if (!reactionsResponse.ok) {
            console.log(`⚠️ OtakuGIFs reactions HTTP ${reactionsResponse.status}`);
            return [];
        }

        const reactionData = await reactionsResponse.json();

        const reactions =
            Array.isArray(reactionData)
                ? reactionData
                : Array.isArray(reactionData?.reactions)
                    ? reactionData.reactions
                    : Array.isArray(reactionData?.data)
                        ? reactionData.data
                        : [];

        const reaction = reactions.find(item => {
            const name = typeof item === "string" ? item : item?.name;
            if (!name) return false;
            return normalizeText(name).replace(/\s+/g, "") === normalizedQuery;
        });

        if (!reaction) {
            console.log(`🎞️ OtakuGIFs: "${query}" não é uma reação conhecida`);
            return [];
        }

        const reactionName = typeof reaction === "string" ? reaction : reaction.name;
        const results = [];

        for (let i = 0; i < Math.min(limit, MAX_OTAKUGIFS); i++) {
            try {
                const response = await fetch(
                    "https://api.otakugifs.xyz/gif" +
                    `?reaction=${encodeURIComponent(reactionName)}`,
                    {
                        headers: {
                            "User-Agent": "chiru-san-bot/1.0"
                        }
                    }
                );

                if (!response.ok) {
                    console.log(`⚠️ OtakuGIFs HTTP ${response.status}`);
                    break;
                }

                const data = await response.json();

                if (data?.url) {
                    results.push({
                        url: data.url,
                        source: "otakugifs",
                        animated: true
                    });
                }
            } catch (err) {
                console.log(`⚠️ OtakuGIFs erro: ${err.message}`);
            }

            await sleep(randomDelay(MIN_DELAY, MAX_DELAY));
        }

        console.log(`🎞️ OtakuGIFs: ${results.length} GIFs para "${query}"`);
        return shuffle(results);
    } catch (err) {
        console.log(`⚠️ OtakuGIFs falhou: ${err.message}`);
        return [];
    }
}

async function searchSafebooru(
    query,
    limit = MAX_SAFEBOORU
) {
    const tag =
        toBooruTag(
            query
        );

    const pages =
        Math.ceil(
            limit / 100
        );

    const results = [];

    for (
        let pid = 0;
        pid < pages;
        pid++
    ) {
        const url =
            `https://safebooru.org/index.php` +
            `?page=dapi` +
            `&s=post` +
            `&q=index` +
            `&json=1` +
            `&limit=100` +
            `&pid=${pid}` +
            `&tags=${encodeURIComponent(tag)}`;

        console.log(
            `🔒 Safebooru pid=${pid} tag=${tag}`
        );

        try {
            const res =
                await fetch(
                    url,
                    {
                        headers: {
                            "User-Agent":
                                "chiru-san-bot/1.0"
                        }
                    }
                );

            if (
                !res.ok
            ) {
                console.log(
                    `⚠️ Safebooru HTTP ${res.status}`
                );
                break;
            }

            const data =
                await res.json();

            if (
                !Array.isArray(data) ||
                data.length === 0
            ) {
                break;
            }

            for (
                const post of data
            ) {
                if (
                    !post?.directory ||
                    !post?.image
                ) {
                    continue;
                }

                results.push({
                    url:
                        `https://safebooru.org/images/` +
                        `${post.directory}/${post.image}`,

                    source:
                        "safebooru",

                    animated:
                        looksAnimatedUrl(
                            `https://safebooru.org/images/${post.directory}/${post.image}`
                        ),

                    id:
                        post.id
                });

                if (
                    results.length >=
                    limit
                ) {
                    break;
                }
            }

            if (
                results.length >=
                limit
            ) {
                break;
            }

            if (
                data.length < 100
            ) {
                break;
            }

            await sleep(
                250
            );
        } catch (err) {
            console.log(
                `⚠️ Safebooru erro: ${err.message}`
            );
            break;
        }
    }

    console.log(
        `🔒 Safebooru: ${results.length} imagens`
    );

    return shuffle(
        results
    );
}

async function fetchPinterest(
    url
) {
    const response =
        await fetch(
            url,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Linux; Android 10) " +
                        "AppleWebKit/537.36 " +
                        "(KHTML, like Gecko) " +
                        "Chrome/151.0.0.0 " +
                        "Mobile Safari/537.36",

                    Accept:
                        "text/html,application/xhtml+xml," +
                        "application/xml;q=0.9,*/*;q=0.8",

                    "Accept-Language":
                        "pt-BR,pt;q=0.9,en;q=0.8"
                }
            }
        );

    if (
        !response.ok
    ) {
        throw new Error(
            "HTTP " + response.status
        );
    }

    return response.text();
}

function extractPinUrls(
    html
) {
    const pins =
        new Set();

    const absoluteRegex =
        /https?:\/\/(?:www\.)?pinterest\.[a-z.]+\/pin\/(\d+)[^"'\\]*/gi;

    let match;

    while (
        (match =
            absoluteRegex.exec(
                html
            ))
    ) {
        pins.add(
            "https://www.pinterest.com/pin/" + match[1] + "/"
        );
    }

    const relativeRegex =
        /["'\\]\/pin\/(\d+)\/?[^"'\\]*/gi;

    while (
        (match =
            relativeRegex.exec(
                html
            ))
    ) {
        pins.add(
            "https://www.pinterest.com/pin/" + match[1] + "/"
        );
    }

    const idRegex =
        /["'](?:id|pinId)["']\s*:\s*["'](\d{6,})["']/gi;

    while (
        (match =
            idRegex.exec(
                html
            ))
    ) {
        pins.add(
            "https://www.pinterest.com/pin/" + match[1] + "/"
        );
    }

    return [
        ...pins
    ];
}

async function searchPinterestPage(
    query,
    page = 1
) {
    const encoded =
        encodeURIComponent(
            query
        );

    let url =
        `https://www.pinterest.com/search/pins/?q=${encoded}`;

    if (
        page > 1
    ) {
        url +=
            `&page=${page}`;
    }

    console.log(
        `🔎 Pinterest página ${page}: ${query}`
    );

    const html =
        await fetchPinterest(
            url
        );

    return extractPinUrls(
        html
    );
}

async function searchPinterest(
    query
) {
    const allPins =
        new Set();

    for (
        let page = 1;
        page <= MAX_SEARCH_PAGES;
        page++
    ) {
        try {
            const pins =
                await searchPinterestPage(
                    query,
                    page
                );

            console.log(
                `📌 Página ${page}: ${pins.length} pins`
            );

            const before =
                allPins.size;

            for (
                const pin of pins
            ) {
                allPins.add(
                    pin
                );

                if (
                    allPins.size >=
                    MAX_CANDIDATES
                ) {
                    break;
                }
            }

            if (
                allPins.size ===
                before
            ) {
                break;
            }

            if (
                allPins.size >=
                MAX_CANDIDATES
            ) {
                break;
            }

            await sleep(
                randomDelay(
                    MIN_DELAY,
                    MAX_DELAY
                )
            );
        } catch (err) {
            console.log(
                `⚠️ Erro na página ${page}: ${err.message}`
            );
        }
    }

    return [
        ...allPins
    ].slice(
        0,
        MAX_CANDIDATES
    );
}

async function extractPinImage(
    pinUrl
) {
    try {
        const html =
            await fetchPinterest(
                pinUrl
            );

        const ogMatch =
            html.match(
                /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
            ) ||
            html.match(
                /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
            );

        if (
            ogMatch?.[1]
        ) {
            return ogMatch[1]
                .replace(
                    /&amp;/g,
                    "&"
                )
                .replace(
                    /\\u002F/g,
                    "/"
                )
                .replace(
                    /\\\//g,
                    "/"
                );
        }

        const pinimgRegex =
            /https?:\/\/i\.pinimg\.com\/[^"'\\\s]+/gi;

        const matches =
            html.match(
                pinimgRegex
            );

        if (
            matches?.length
        ) {
            return matches[0]
                .replace(
                    /&amp;/g,
                    "&"
                )
                .replace(
                    /\\u002F/g,
                    "/"
                )
                .replace(
                    /\\\//g,
                    "/"
                );
        }

        return null;
    } catch {
        return null;
    }
}

async function resolvePinterestImages(
    pinUrls,
    needed
) {
    const images = [];

    let i = 0;

    async function worker() {
        while (
            images.length < needed &&
            i < pinUrls.length
        ) {
            const current =
                i++;

            const pinUrl =
                pinUrls[current];

            const imgUrl =
                await extractPinImage(
                    pinUrl
                );

            if (
                imgUrl
            ) {
                images.push({
                    url:
                        imgUrl,

                    source:
                        "pinterest",
                    animated:
                        looksAnimatedUrl(imgUrl)
                });
            }

            await sleep(
                randomDelay(
                    MIN_DELAY,
                    MAX_DELAY
                )
            );
        }
    }

    const workers =
        Array.from(
            {
                length:
                    CONCURRENCY
            },
            () =>
                worker()
        );

    await Promise.all(
        workers
    );

    console.log(
        `📌 Pinterest resolvido: ${images.length} imagens`
    );

    return images;
}

async function searchWikimediaCommons(
    query,
    limit = MAX_WIKIMEDIA
) {
    const results = [];

    let offset = 0;

    const batchSize = 50;

    while (
        results.length < limit
    ) {
        const batchLimit =
            Math.min(
                batchSize,
                limit -
                    results.length
            );

        const params =
            new URLSearchParams({
                action:
                    "query",

                format:
                    "json",

                formatversion:
                    "2",

                generator:
                    "search",

                gsrsearch:
                    query,

                gsrnamespace:
                    "6",

                gsrlimit:
                    String(
                        batchLimit
                    ),

                gsroffset:
                    String(
                        offset
                    ),

                prop:
                    "imageinfo",

                iiprop:
                    "url|mime|size|dimensions",

                iiurlwidth:
                    "1280"
            });

        const url =
            `${WIKIMEDIA_API}?${params.toString()}`;

        console.log(
            `🌐 Wikimedia Commons: "${query}" offset=${offset}`
        );

        try {
            const response =
                await fetch(
                    url,
                    {
                        headers: {
                            "User-Agent":
                                "Chiru-san-Bot/1.0 " +
                                "(WhatsApp sticker bot)"
                        }
                    }
                );

            if (
                !response.ok
            ) {
                console.log(
                    `⚠️ Wikimedia HTTP ${response.status}`
                );
                break;
            }

            const data =
                await response.json();

            const pages =
                data?.query?.pages;

            if (
                !Array.isArray(pages) ||
                pages.length === 0
            ) {
                break;
            }

            for (
                const page of pages
            ) {
                const info =
                    page?.imageinfo?.[0];

                if (
                    !info
                ) {
                    continue;
                }

                const mime =
                    String(
                        info.mime ?? ""
                    ).toLowerCase();

                if (
                    !mime.startsWith(
                        "image/"
                    ) ||
                    mime ===
                        "image/svg+xml"
                ) {
                    continue;
                }

                const imageUrl =
                    info.thumburl ||
                    info.url;

                if (
                    !imageUrl
                ) {
                    continue;
                }

                results.push({
                    url:
                        imageUrl,

                    source:
                        "wikimedia",

                    animated:
                        false,

                    title:
                        page.title,

                    pageUrl:
                        info.descriptionurl,

                    mime,

                    width:
                        info.thumbwidth ||
                        info.width,

                    height:
                        info.thumbheight ||
                        info.height
                });

                if (
                    results.length >=
                    limit
                ) {
                    break;
                }
            }

            if (
                results.length >=
                limit
            ) {
                break;
            }

            if (
                !data?.continue
            ) {
                break;
            }

            offset +=
                pages.length;

            await sleep(
                randomDelay(
                    MIN_DELAY,
                    MAX_DELAY
                )
            );
        } catch (err) {
            console.log(
                `⚠️ Wikimedia erro: ${err.message}`
            );
            break;
        }
    }

    console.log(
        `🌐 Wikimedia Commons: ${results.length} imagens`
    );

    return shuffle(
        results
    );
}

async function buscarTodasFontes(query) {
    const seen = new Set();
    const candidates = [];

    function addAll(list) {
        for (const item of list) {
            if (!item?.url || seen.has(item.url)) continue;
            seen.add(item.url);
            candidates.push({
                ...item,
                animated:
                    item.animated === true ||
                    looksAnimatedUrl(item.url)
            });
        }
    }

    addAll(await searchGooglePhotos(query));
    console.log(`📦 Após Google Fotos: ${candidates.length} candidatos`);

    if (candidates.length < TOTAL_STICKERS) {
        const pins = await searchPinterest(query);
        addAll(await resolvePinterestImages(
            pins,
            Math.max(TOTAL_STICKERS - candidates.length + 40, 40)
        ));
        console.log(`📦 Após Pinterest: ${candidates.length} candidatos`);
    }

    addAll(await searchNekosBest(query));
    console.log(`📦 Após NekosBest: ${candidates.length} candidatos`);

    const animatedCount = candidates.filter(item => item.animated).length;
    if (animatedCount < TARGET_ANIMATED) {
        addAll(await searchOtakuGifs(
            query,
            Math.max(TARGET_ANIMATED - animatedCount, 10)
        ));
        console.log(`📦 Após OtakuGIFs: ${candidates.length} candidatos`);
    }

    if (candidates.length < TOTAL_STICKERS) {
        const falta = TOTAL_STICKERS - candidates.length + 60;
        addAll(await searchSafebooru(query, Math.max(falta, 80)));
        console.log(`📦 Após Safebooru: ${candidates.length} candidatos`);
    }

    if (candidates.length < TOTAL_STICKERS && shouldUseWikimedia(query)) {
        addAll(await searchWikimediaCommons(query, MAX_WIKIMEDIA));
        console.log(`📦 Após Wikimedia Commons: ${candidates.length} candidatos`);
    } else if (!shouldUseWikimedia(query)) {
        console.log(`🌐 Wikimedia ignorado para "${query}" (consulta não permitida)`);
    }

    const animated = shuffle(candidates.filter(item => item.animated));
    const staticImages = shuffle(candidates.filter(item => !item.animated));

    const selected = [
        ...animated.slice(0, TARGET_ANIMATED),
        ...staticImages.slice(0, TARGET_STATIC)
    ];

    if (selected.length < TOTAL_STICKERS) {
        const selectedUrls = new Set(selected.map(item => item.url));

        for (const item of shuffle(candidates)) {
            if (selected.length >= TOTAL_STICKERS) break;
            if (!selectedUrls.has(item.url)) {
                selected.push(item);
                selectedUrls.add(item.url);
            }
        }
    }

    const finalCandidates = shuffle(selected).slice(0, TOTAL_STICKERS);

    console.log(
        `📦 Seleção final: ${finalCandidates.filter(item => item.animated).length} animados + ${finalCandidates.filter(item => !item.animated).length} estáticos`
    );

    return finalCandidates;
}

async function downloadToFile(
    url,
    dest
) {
    const res =
        await fetch(
            url,
            {
                headers: {
                    "User-Agent":
                        "chiru-san-bot/1.0"
                }
            }
        );

    if (
        !res.ok
    ) {
        throw new Error(
            `HTTP ${res.status}`
        );
    }

    const buf =
        Buffer.from(
            await res.arrayBuffer()
        );

    if (
        buf.length >
        MAX_IMAGE_SIZE
    ) {
        throw new Error(
            "imagem muito grande"
        );
    }

    await fs.writeFile(
        dest,
        buf
    );
}

async function isReadyWebp(
    inputPath
) {
    try {
        const { stdout } =
            await run(
                "ffprobe",
                [
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=codec_name,width,height",
                    "-of",
                    "csv=p=0",
                    inputPath
                ]
            );

        const [codec, width, height] =
            stdout
                .trim()
                .split(",");

        return (
            codec === "webp" &&
            Number(width) === 512 &&
            Number(height) === 512
        );
    } catch {
        return false;
    }
}

async function convertToSticker(
    inputPath,
    outputPath,
    animated = false
) {
    if (await isReadyWebp(inputPath)) {
        const stat =
            await fs.stat(inputPath);

        if (
            stat.size <=
            MAX_STICKER_SIZE
        ) {
            await fs.copyFile(
                inputPath,
                outputPath
            );

            return;
        }

        throw new Error(
            "WebP 512x512 pronto, mas continua maior que 1 MB"
        );
    }

    const baseFilter =
        "scale=512:512:" +
        "force_original_aspect_ratio=decrease," +
        "pad=512:512:" +
        "(ow-iw)/2:(oh-ih)/2:" +
        "color=0x00000000";

    async function encode(quality, fps) {
        const finalFilter = animated
            ? `fps=${fps},${baseFilter}`
            : baseFilter;

        const args = [
            "-y",
            "-i",
            inputPath,
            "-vf",
            finalFilter,
            "-an",
            "-c:v",
            "libwebp",
            "-quality",
            String(quality),
            "-compression_level",
            "4"
        ];

        if (animated) {
            args.push("-loop", "0", "-t", "6");
        }

        args.push(outputPath);
        await run("ffmpeg", args);
    }

    await encode(animated ? 70 : 80, animated ? 12 : null);

    let stat = await fs.stat(outputPath);

    if (stat.size > MAX_STICKER_SIZE) {
        await encode(animated ? 45 : 55, animated ? 8 : null);
        stat = await fs.stat(outputPath);

        if (stat.size > MAX_STICKER_SIZE) {
            throw new Error(
                animated
                    ? "sticker animado continua maior que 1 MB"
                    : "sticker continua maior que 1 MB"
            );
        }
    }
}

async function processImages(
    candidates,
    tmpDir
) {
    const stickers =
        [];

    let index =
        0;

    async function worker() {
        while (
            stickers.length <
                TOTAL_STICKERS &&
            index <
                candidates.length
        ) {
            const current =
                index++;

            const item =
                candidates[
                    current
                ];

            if (
                !item?.url
            ) {
                continue;
            }

            const id =
                randomUUID();

            const rawPath =
                path.join(
                    tmpDir,
                    `${id}.img`
                );

            const webpPath =
                path.join(
                    tmpDir,
                    `${id}.webp`
                );

            try {
                await downloadToFile(
                    item.url,
                    rawPath
                );

                await convertToSticker(
                    rawPath,
                    webpPath,
                    item.animated === true
                );

                const buf =
                    await fs.readFile(
                        webpPath
                    );

                if (
                    buf.length > 0 &&
                    buf.length <=
                        MAX_STICKER_SIZE
                ) {
                    stickers.push(
                        buf
                    );

                    console.log(
                        `✅ ${stickers.length}/${TOTAL_STICKERS} (${item.source} • ${item.animated ? "animado" : "estático"})`
                    );
                }
            } catch (err) {
                console.log(
                    `⚠️ Falha em imagem (${item.source}): ${err.message}`
                );
            } finally {
                await fs.unlink(
                    rawPath
                ).catch(
                    () => {}
                );

                await fs.unlink(
                    webpPath
                ).catch(
                    () => {}
                );
            }
        }
    }

    await Promise.all(
        Array.from(
            {
                length:
                    CONCURRENCY
            },
            () =>
                worker()
        )
    );

    return stickers.slice(
        0,
        TOTAL_STICKERS
    );
}

export default {
    name:
        "pack",

    aliases: [
        "stickerpack",
        "figpack"
    ],

    description:
        "Gera pack de stickers " +
        "(Google Fotos + Pinterest + NekosBest + OtakuGIFs + Safebooru + Wikimedia restrito)",

    async execute(
        sock,
        msg,
        args
    ) {
        const query =
            (args ?? [])
                .join(" ")
                .trim();

        const from =
            msg.key.remoteJid;

        if (
            !query
        ) {
            await sock.sendMessage(
                from,
                {
                    text:
                        "Use: *.pack nome do personagem*"
                },
                {
                    quoted:
                        msg
                }
            );

            return;
        }

        await sock.sendMessage(
            from,
            {
                text:
                    `🔎 Montando pack de *${query}* ` +
                    `(até ${TOTAL_STICKERS} figs)...\n` +
                    `Fontes: Google Fotos → Pinterest → NekosBest → OtakuGIFs → Safebooru → Wikimedia restrito`
            },
            {
                quoted:
                    msg
            }
        );

        const tmpDir =
            await fs.mkdtemp(
                path.join(
                    os.tmpdir(),
                    "pack-"
                )
            );

        try {
            const candidates =
                await buscarTodasFontes(
                    query
                );

            if (
                !candidates.length
            ) {
                await sock.sendMessage(
                    from,
                    {
                        text:
                            `❌ Não achei imagens pra *${query}*.`
                    },
                    {
                        quoted:
                            msg
                    }
                );

                return;
            }

            const stickers =
                await processImages(
                    candidates,
                    tmpDir
                );

            if (
                stickers.length < 5
            ) {
                await sock.sendMessage(
                    from,
                    {
                        text:
                            `❌ Só consegui *${stickers.length}* ` +
                            `figurinhas válidas pra *${query}*.`
                    },
                    {
                        quoted:
                            msg
                    }
                );

                return;
            }

            console.log(
                `📦 Preparando envio do pack com ${stickers.length} stickers...`
            );

            await sendStickerPack(
                sock,
                from,
                stickers,
                {
                    name:
                        query,

                    publisher:
                        "Chiru-san Bot",

                    description:
                        `🌸 ${query}`
                }
            );

            console.log(
                `📦 Pack enviado com sucesso: ${query}`
            );

            await sock.sendMessage(
                from,
                {
                    text:
                        `✅ Pack *${query}* pronto ` +
                        `(*${stickers.length}* figs)`
                },
                {
                    quoted:
                        msg
                }
            );
        } catch (err) {
            console.error(
                "pack error:",
                err
            );

            await sock.sendMessage(
                from,
                {
                    text:
                        `❌ Erro ao montar o pack: ${err.message}`
                },
                {
                    quoted:
                        msg
                }
            );
        } finally {
            await fs.rm(
                tmpDir,
                {
                    recursive:
                        true,

                    force:
                        true
                }
            ).catch(
                () => {}
            );
        }
    }
};
