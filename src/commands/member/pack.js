// src/commands/member/pack.js
// Google Fotos → Safebooru → Pinterest → Wikimedia Commons → pack de 60 stickers

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
const MAX_WIKIMEDIA = 120;
const MAX_OTAKUGIFS = 60;
const MAX_NEKOSBEST = 20;

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


/*
 * ============================================================
 * AUXILIARES
 * ============================================================
 */

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


/*
 * ============================================================
 * GOOGLE FOTOS
 * ============================================================
 */

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


    /*
     * Primeiro tenta correspondência exata.
     */

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


    /*
     * Depois tenta correspondência parcial.
     */

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


                        /*
                         * Só adiciona dimensões se
                         * a URL ainda não tiver parâmetros.
                         */

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
                                "google-photos"
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


/*
 * ============================================================
 * SAFEBOORU
 * ============================================================
 */

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


/*
 * ============================================================
 * PINTEREST
 * ============================================================
 */

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
            `HTTP ${response.status}`
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
            `https://www.pinterest.com/pin/${match[1]}/`
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
            `https://www.pinterest.com/pin/${match[1]}/`
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
            `https://www.pinterest.com/pin/${match[1]}/`
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
                        "pinterest"
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


/*
 * ============================================================
 * WIKIMEDIA COMMONS
 * ============================================================
 *
 * Usa a API oficial do Wikimedia Commons.
 *
 * Busca páginas no namespace de arquivos e pede:
 *
 * - URL da imagem
 * - URL da página do arquivo
 * - MIME
 * - dimensões
 *
 * A thumbnail de até 1280 px é usada para evitar
 * baixar arquivos gigantes.
 */

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


                /*
                 * Só queremos imagens.
                 *
                 * SVG é evitado porque o FFmpeg pode
                 * lidar com ele de maneira diferente
                 * dependendo da instalação.
                 */

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


            /*
             * A API informa se ainda existe
             * continuação.
             */

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


/*
 * ============================================================
 * OTAKUGIFS
 * ============================================================
 */

async function searchOtakuGifs(query, limit = MAX_OTAKUGIFS) {
    const normalizedQuery = normalizeText(query).replace(/\s+/g, "");
    if (!normalizedQuery) return [];

    try {
        const reactionsResponse = await fetch(
            "https://api.otakugifs.xyz/gif/allreactions",
            { headers: { "User-Agent": "chiru-san-bot/1.0" } }
        );

        if (!reactionsResponse.ok) {
            console.log(`⚠️ OtakuGIFs reactions HTTP ${reactionsResponse.status}`);
            return [];
        }

        const reactionData = await reactionsResponse.json();
        const reactions = Array.isArray(reactionData)
            ? reactionData
            : Array.isArray(reactionData?.reactions)
                ? reactionData.reactions
                : Array.isArray(reactionData?.data)
                    ? reactionData.data
                    : [];

        const reaction = reactions.find(item =>
            normalizeText(typeof item === "string" ? item : item?.name)
                .replace(/\s+/g, "") === normalizedQuery
        );

        if (!reaction) {
            console.log(`🎞️ OtakuGIFs: "${query}" não é uma reação conhecida`);
            return [];
        }

        const reactionName = typeof reaction === "string" ? reaction : reaction.name;
        const results = [];

        for (let i = 0; i < Math.min(limit, 10); i++) {
            try {
                const response = await fetch(
                    "https://api.otakugifs.xyz/gif" +
                    `?reaction=${encodeURIComponent(reactionName)}`,
                    { headers: { "User-Agent": "chiru-san-bot/1.0" } }
                );

                if (!response.ok) {
                    console.log(`⚠️ OtakuGIFs HTTP ${response.status}`);
                    break;
                }

                const data = await response.json();
                if (data?.url) results.push({ url: data.url, source: "otakugifs" });
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


/*
 * ============================================================
 * NEKOSBEST
 * ============================================================
 */

async function searchNekosBest(query, limit = MAX_NEKOSBEST) {
    const results = [];

    async function search(type) {
        const params = new URLSearchParams({
            query,
            type: String(type),
            amount: String(Math.min(limit, 20))
        });

        try {
            const response = await fetch(
                `https://nekos.best/api/v2/search?${params.toString()}`,
                { headers: { "User-Agent": "chiru-san-bot/1.0" } }
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

    await search(1);

    const reactionQueries = new Set([
        "angry", "baka", "bite", "bleh", "blowkiss", "blush", "bonk",
        "bored", "carry", "clap", "confused", "cry", "cuddle", "dance",
        "facepalm", "feed", "happy", "handhold", "handshake", "highfive",
        "hug", "kiss", "laugh", "nom", "nya", "pat", "peck", "poke", "pout",
        "punch", "run", "salute", "slap", "sleep", "smile", "smug", "stare",
        "think", "thumbsup", "tickle", "wave", "wink", "yawn"
    ]);

    if (reactionQueries.has(normalizeText(query).replace(/\s+/g, ""))) {
        await search(2);
    }

    console.log(`🐱 NekosBest: ${results.length} resultados para "${query}"`);
    return shuffle(results);
}


/*
 * ============================================================
 * BUSCA TODAS AS FONTES
 * ============================================================
 */

async function buscarTodasFontes(
    query
) {

    const seen =
        new Set();

    const candidates =
        [];


    function addAll(
        list
    ) {

        for (
            const item of list
        ) {

            if (
                !item?.url ||
                seen.has(
                    item.url
                )
            ) {
                continue;
            }


            seen.add(
                item.url
            );


            candidates.push(
                item
            );
        }
    }


    /*
     * 1. GOOGLE FOTOS
     */

    const google =
        await searchGooglePhotos(
            query
        );


    addAll(
        google
    );


    console.log(
        `📦 Após Google Fotos: ${candidates.length} candidatos`
    );


    /*
     * 2. SAFEBOORU
     */

    if (
        candidates.length <
        TOTAL_STICKERS
    ) {

        const falta =
            TOTAL_STICKERS -
            candidates.length +
            50;


        console.log(
            `🔒 Faltam ${TOTAL_STICKERS - candidates.length} → consultando Safebooru`
        );


        const safe =
            await searchSafebooru(
                query,
                Math.max(
                    falta,
                    60
                )
            );


        addAll(
            safe
        );


        console.log(
            `📦 Após Safebooru: ${candidates.length} candidatos`
        );
    }


    /*
     * 3. PINTEREST
     */

    if (
        candidates.length <
        TOTAL_STICKERS
    ) {

        const falta =
            TOTAL_STICKERS -
            candidates.length +
            40;


        console.log(
            `📌 Ainda faltam ${TOTAL_STICKERS - candidates.length} → consultando Pinterest`
        );


        const pins =
            await searchPinterest(
                query
            );


        const pinImages =
            await resolvePinterestImages(
                pins,
                Math.max(
                    falta,
                    40
                )
            );


        addAll(
            pinImages
        );


        console.log(
            `📦 Após Pinterest: ${candidates.length} candidatos`
        );
    }


    /*
     * 4. WIKIMEDIA COMMONS
     */

    if (
        candidates.length <
        TOTAL_STICKERS
    ) {

        const falta =
            TOTAL_STICKERS -
            candidates.length +
            60;


        console.log(
            `🌐 Ainda faltam ${TOTAL_STICKERS - candidates.length} → consultando Wikimedia Commons`
        );


        const wikimedia =
            await searchWikimediaCommons(
                query,
                Math.min(
                    Math.max(
                        falta,
                        60
                    ),
                    MAX_WIKIMEDIA
                )
            );


        addAll(
            wikimedia
        );


        console.log(
            `📦 Após Wikimedia Commons: ${candidates.length} candidatos`
        );
    }


    /*
     * 5. NEKOSBEST
     */

    if (candidates.length < TOTAL_STICKERS) {
        console.log(
            `🐱 Ainda faltam ${TOTAL_STICKERS - candidates.length} → consultando NekosBest`
        );

        const nekos = await searchNekosBest(query);
        addAll(nekos);

        console.log(
            `📦 Após NekosBest: ${candidates.length} candidatos`
        );
    }


    /*
     * 6. OTAKUGIFS
     */

    if (candidates.length < TOTAL_STICKERS) {
        console.log(
            `🎞️ Ainda faltam ${TOTAL_STICKERS - candidates.length} → consultando OtakuGIFs`
        );

        const otaku = await searchOtakuGifs(query);
        addAll(otaku);

        console.log(
            `📦 Após OtakuGIFs: ${candidates.length} candidatos`
        );
    }


    console.log(
        `📦 Total de candidatos únicos: ${candidates.length}`
    );


    return shuffle(
        candidates
    ).slice(
        0,
        MAX_CANDIDATES
    );
}


/*
 * ============================================================
 * DOWNLOAD
 * ============================================================
 */

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


/*
 * ============================================================
 * CONVERTE PARA WEBP
 * ============================================================
 */

async function convertToSticker(
    inputPath,
    outputPath
) {

    const filter =
        "scale=512:512:" +
        "force_original_aspect_ratio=decrease," +
        "pad=512:512:" +
        "(ow-iw)/2:(oh-ih)/2:" +
        "color=0x00000000";


    await run(
        "ffmpeg",
        [
            "-y",

            "-i",
            inputPath,

            "-vf",
            filter,

            "-c:v",
            "libwebp",

            "-quality",
            "80",

            "-compression_level",
            "4",

            outputPath
        ]
    );


    let stat =
        await fs.stat(
            outputPath
        );


    if (
        stat.size >
        MAX_STICKER_SIZE
    ) {

        await run(
            "ffmpeg",
            [
                "-y",

                "-i",
                inputPath,

                "-vf",
                filter,

                "-c:v",
                "libwebp",

                "-quality",
                "55",

                outputPath
            ]
        );


        stat =
            await fs.stat(
                outputPath
            );


        if (
            stat.size >
            MAX_STICKER_SIZE
        ) {

            throw new Error(
                "sticker continua maior que 1 MB"
            );
        }
    }
}


/*
 * ============================================================
 * PROCESSA IMAGENS
 * ============================================================
 */

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
                    webpPath
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
                        `✅ ${stickers.length}/${TOTAL_STICKERS} (${item.source})`
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


/*
 * ============================================================
 * COMANDO
 * ============================================================
 */

export default {

    name:
        "pack",

    aliases: [
        "stickerpack",
        "figpack"
    ],

    description:
        "Gera pack de stickers " +
        "(Google Fotos + Safebooru + Pinterest + Wikimedia Commons + NekosBest + OtakuGIFs)",


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


        /*
         * Sem nome.
         */

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


        /*
         * Aviso inicial.
         */

        await sock.sendMessage(
            from,
            {
                text:
                    `🔎 Montando pack de *${query}* ` +
                    `(até ${TOTAL_STICKERS} figs)...\n` +
                    `Fonte: Google Fotos → Safebooru → Pinterest → Wikimedia Commons → NekosBest → OtakuGIFs`
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

            /*
             * Busca candidatos.
             */

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


            /*
             * Processa stickers.
             */

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


            /*
             * =================================================
             * CORREÇÃO IMPORTANTE
             * =================================================
             *
             * sendStickerPack() recebe:
             *
             *   sock
             *   jid
             *   stickers
             *   options
             */

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


            /*
             * Confirmação.
             */

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
