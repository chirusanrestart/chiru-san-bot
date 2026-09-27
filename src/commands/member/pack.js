import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { sendStickerPack } from "../../services/stickerPack.js";
import { fetchImageUrls } from "@marcus5914/google-photos-album-image-url-fetch";

const execFileAsync = promisify(execFile);

// ============================================================
// CONFIG
// ============================================================

const TOTAL_STICKERS = 60;

// Apenas 1 candidato por vez
const CONCURRENCY = 3;

// Intervalo entre candidatos do Pinterest
const MIN_DELAY = 100;
const MAX_DELAY = 200;

const MAX_CANDIDATES = 150;
const MAX_SEARCH_PAGES = 5;

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const MAX_STICKER_SIZE = 1 * 1024 * 1024;

// Arquivo com os álbuns do Google Fotos
const GOOGLE_PHOTOS_FILE = path.resolve(
    process.cwd(),
    "google-photos-albums.json"
);

// ============================================================
// EXEC
// ============================================================

async function run(command, args, options = {}) {
    return execFileAsync(command, args, {
        maxBuffer: 32 * 1024 * 1024,
        ...options
    });
}

// ============================================================
// DELAY
// ============================================================

function sleep(ms) {
    return new Promise(
        resolve => setTimeout(resolve, ms)
    );
}

function randomDelay(min, max) {
    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}

// ============================================================
// EMBARALHAR
// ============================================================

function shuffle(array) {
    return [...array].sort(
        () => Math.random() - 0.5
    );
}

// ============================================================
// NORMALIZAR TEXTO
// ============================================================

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

// ============================================================
// CARREGAR ÁLBUNS DO GOOGLE FOTOS
// ============================================================

async function loadGooglePhotosAlbums() {
    try {
        const content =
            await fs.readFile(
                GOOGLE_PHOTOS_FILE,
                "utf8"
            );

        const data =
            JSON.parse(content);

        if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data)
        ) {
            throw new Error(
                "google-photos-albums.json precisa conter um objeto."
            );
        }

        return data;

    } catch (err) {

        if (
            err.code === "ENOENT"
        ) {
            console.log(
                "⚠️ google-photos-albums.json não encontrado."
            );

            return {};
        }

        console.log(
            `⚠️ Falha ao carregar álbuns do Google Fotos: ${err.message}`
        );

        return {};
    }
}

// ============================================================
// ENCONTRAR ÁLBUM DO PERSONAGEM
// ============================================================

async function findGooglePhotosAlbum(
    query
) {
    const albums =
        await loadGooglePhotosAlbums();

    const normalizedQuery =
        normalizeText(query);

    // Correspondência exata
    for (
        const [name, url] of
        Object.entries(albums)
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

    // Correspondência por inclusão
    for (
        const [name, url] of
        Object.entries(albums)
    ) {
        const normalizedName =
            normalizeText(name);

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

// ============================================================
// BUSCAR GOOGLE FOTOS
// ============================================================

async function searchGooglePhotos(
    query
) {
    const album =
        await findGooglePhotosAlbum(
            query
        );

    if (!album) {
        console.log(
            `📸 Google Fotos: nenhum álbum cadastrado para "${query}"`
        );

        return [];
    }

    console.log(
        `📸 Google Fotos: álbum encontrado → ${album.name}`
    );

    try {
        const items =
            await fetchImageUrls(
                album.url
            );

        if (!items?.length) {
            console.log(
                "⚠️ Google Fotos: álbum vazio ou sem mídias."
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

                        // Tenta pegar uma versão grande
                        if (
                            item.width &&
                            item.height
                        ) {
                            url =
                                `${url}=w${item.width}-h${item.height}`;
                        }

                        return {
                            url,
                            source:
                                "google-photos",
                            uid:
                                item.uid
                        };
                    }
                );

        console.log(
            `📸 Google Fotos: ${images.length} imagens válidas`
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

// ============================================================
// BUSCAR HTML DO PINTEREST
// ============================================================

async function fetchPinterest(url) {
    const response =
        await fetch(
            url,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 " +
                        "(KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36",

                    "Accept":
                        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

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

    return await response.text();
}

// ============================================================
// EXTRAIR URLS DOS PINS
// ============================================================

function extractPinUrls(html) {
    const pins =
        new Set();

    const absoluteRegex =
        /https?:\/\/(?:www\.)?pinterest\.[a-z.]+\/pin\/(\d+)[^"'\\]*/gi;

    let match;

    while (
        (match =
            absoluteRegex.exec(html))
    ) {
        pins.add(
            `https://www.pinterest.com/pin/${match[1]}/`
        );
    }

    const relativeRegex =
        /["'\\](\/pin\/(\d+)\/?)[^"'\\]*/gi;

    while (
        (match =
            relativeRegex.exec(html))
    ) {
        pins.add(
            `https://www.pinterest.com/pin/${match[2]}/`
        );
    }

    const idRegex =
        /["'](?:id|pinId)["']\s*:\s*["'](\d{6,})["']/gi;

    while (
        (match =
            idRegex.exec(html))
    ) {
        pins.add(
            `https://www.pinterest.com/pin/${match[1]}/`
        );
    }

    return [
        ...pins
    ];
}

// ============================================================
// BUSCAR UMA PÁGINA
// ============================================================

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
        url += `&page=${page}`;
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

// ============================================================
// BUSCAR VÁRIAS PÁGINAS
// ============================================================

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
                `📌 Página ${page}: ${pins.length} Pins encontrados`
            );

            const antes =
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
                antes
            ) {
                console.log(
                    "⚠️ Nenhum Pin novo encontrado."
                );

                break;
            }

            if (
                allPins.size >=
                MAX_CANDIDATES
            ) {
                break;
            }

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

// ============================================================
// EXTRAIR IMAGEM DO PIN
// ============================================================

async function extractPin(
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
                    /\\u002F/g,
                    "/"
                )
                .replace(
                    /\\\//g,
                    "/"
                )
                .replace(
                    /\\u003D/g,
                    "="
                )
                .replace(
                    /&amp;/g,
                    "&"
                );
        }

        return null;

    } catch (err) {
        console.log(
            `⚠️ Falha ao extrair Pin ${pinUrl}: ${err.message}`
        );

        return null;
    }
}

// ============================================================
// BAIXAR IMAGEM COM NODE
// ============================================================

async function downloadImage(
    url
) {
    const response =
        await fetch(
            url,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 " +
                        "(KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36",

                    "Accept":
                        "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
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

    const contentLength =
        Number(
            response.headers.get(
                "content-length"
            )
        ) || 0;

    if (
        contentLength >
        MAX_IMAGE_SIZE
    ) {
        throw new Error(
            "Imagem maior que 12 MB"
        );
    }

    const buffer =
        Buffer.from(
            await response.arrayBuffer()
        );

    if (
        buffer.length >
        MAX_IMAGE_SIZE
    ) {
        throw new Error(
            "Imagem maior que 12 MB"
        );
    }

    if (
        !buffer.length
    ) {
        throw new Error(
            "Imagem vazia"
        );
    }

    return buffer;
}

// ============================================================
// CONVERTER PARA WEBP
// ============================================================

async function convertToWebP(
    inputBuffer,
    tempDir,
    index
) {
    const input =
        path.join(
            tempDir,
            `input_${index}_${randomUUID()}.img`
        );

    const output =
        path.join(
            tempDir,
            `sticker_${index}_${randomUUID()}.webp`
        );

    await fs.writeFile(
        input,
        inputBuffer
    );

    try {
        await run(
            "ffmpeg",
            [
                "-y",
                "-i",
                input,
                "-vf",
                "scale=512:512",
                "-c:v",
                "libwebp",
                "-quality",
                "70",
                "-preset",
                "default",
                output
            ]
        );

        let result =
            await fs.readFile(
                output
            );

        if (
            result.length >
            MAX_STICKER_SIZE
        ) {
            await run(
                "ffmpeg",
                [
                    "-y",
                    "-i",
                    input,
                    "-vf",
                    "scale=512:512",
                    "-c:v",
                    "libwebp",
                    "-quality",
                    "50",
                    "-preset",
                    "default",
                    output
                ]
            );

            result =
                await fs.readFile(
                    output
                );
        }

        if (
            result.length >
            MAX_STICKER_SIZE
        ) {
            await run(
                "ffmpeg",
                [
                    "-y",
                    "-i",
                    input,
                    "-vf",
                    "scale=512:512",
                    "-c:v",
                    "libwebp",
                    "-quality",
                    "35",
                    "-preset",
                    "default",
                    output
                ]
            );

            result =
                await fs.readFile(
                    output
                );
        }

        if (
            result.length >
            MAX_STICKER_SIZE
        ) {
            throw new Error(
                `Sticker continua maior que 1 MB (${result.length} bytes)`
            );
        }

        return result;

    } finally {
        await fs.unlink(
            input
        ).catch(
            () => {}
        );

        await fs.unlink(
            output
        ).catch(
            () => {}
        );
    }
}

// ============================================================
// PROCESSAR IMAGENS DO GOOGLE FOTOS
// ============================================================

async function processGooglePhotos(
    images,
    alreadyHave = []
) {
    const result =
        [...alreadyHave];

    if (
        result.length >=
        TOTAL_STICKERS
    ) {
        return result.slice(
            0,
            TOTAL_STICKERS
        );
    }

    const tempDir =
        await fs.mkdtemp(
            path.join(
                os.tmpdir(),
                "pack-google-"
            )
        );

    try {
        let index = 0;

        for (
            const item of images
        ) {
            if (
                result.length >=
                TOTAL_STICKERS
            ) {
                break;
            }

            index++;

            console.log(
                `📸 [Google Fotos] Tentando ${index}/${images.length}`
            );

            try {
                const image =
                    await downloadImage(
                        item.url
                    );

                const sticker =
                    await convertToWebP(
                        image,
                        tempDir,
                        index
                    );

                result.push(
                    sticker
                );

                console.log(
                    `✅ [Google Fotos] Sticker válido: ${result.length}/${TOTAL_STICKERS}`
                );

            } catch (err) {
                console.log(
                    `❌ [Google Fotos] Falhou: ${err.message}`
                );
            }
        }

    } finally {
        await fs.rm(
            tempDir,
            {
                recursive: true,
                force: true
            }
        ).catch(
            () => {}
        );
    }

    return result;
}

// ============================================================
// PROCESSAR CANDIDATOS DO PINTEREST
// ============================================================

async function processPinterestCandidates(
    candidates,
    alreadyHave = []
) {
    const result =
        [...alreadyHave];

    let current = 0;

    if (
        result.length >=
        TOTAL_STICKERS
    ) {
        return result.slice(
            0,
            TOTAL_STICKERS
        );
    }

    const tempDir =
        await fs.mkdtemp(
            path.join(
                os.tmpdir(),
                "pack-pinterest-"
            )
        );

    async function worker(
        workerId
    ) {
        while (true) {

            if (
                result.length >=
                TOTAL_STICKERS
            ) {
                return;
            }

            const index =
                current++;

            if (
                index >=
                candidates.length
            ) {
                return;
            }

            const pinUrl =
                candidates[index];

            if (
                index > 0
            ) {
                const delay =
                    randomDelay(
                        MIN_DELAY,
                        MAX_DELAY
                    );

                console.log(
                    `⏳ Próximo Pin em ${delay}ms`
                );

                await sleep(
                    delay
                );
            }

            console.log(
                `🖼️ [Pinterest ${workerId}] Tentando ${index + 1}/${candidates.length}`
            );

            try {
                const imageUrl =
                    await extractPin(
                        pinUrl
                    );

                if (
                    !imageUrl
                ) {
                    throw new Error(
                        "Imagem não encontrada"
                    );
                }

                const image =
                    await downloadImage(
                        imageUrl
                    );

                const sticker =
                    await convertToWebP(
                        image,
                        tempDir,
                        index
                    );

                result.push(
                    sticker
                );

                console.log(
                    `✅ [Pinterest ${workerId}] Sticker válido: ${result.length}/${TOTAL_STICKERS}`
                );

            } catch (err) {
                console.log(
                    `❌ [Pinterest ${workerId}] Falhou: ${err.message}`
                );
            }
        }
    }

    try {
        const workers = [];

        for (
            let i = 0;
            i < CONCURRENCY;
            i++
        ) {
            workers.push(
                worker(i + 1)
            );
        }

        await Promise.all(
            workers
        );

    } finally {
        await fs.rm(
            tempDir,
            {
                recursive: true,
                force: true
            }
        ).catch(
            () => {}
        );
    }

    return result;
}

// ============================================================
// EXECUTE
// ============================================================

export default {
    name: "pack",

    aliases: [
        "pack",
        "stickerpack"
    ],

    async execute(
        sock,
        msg,
        args
    ) {
        const query =
            args
                .join(" ")
                .trim();

        if (!query) {
            return sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
                        "❌ Use: .pack nome da coisa"
                },
                {
                    quoted: msg
                }
            );
        }

        console.log("");
        console.log(
            "=============================================="
        );
        console.log(
            "📦 STICKER PACK"
        );
        console.log(
            "=============================================="
        );
        console.log(
            `🔎 Busca: ${query}`
        );
        console.log(
            `🎯 Meta: ${TOTAL_STICKERS}`
        );
        console.log(
            "=============================================="
        );

        try {

            // ==================================================
            // 1. GOOGLE FOTOS
            // ==================================================

            console.log("");
            console.log(
                "📸 FONTE PRINCIPAL: GOOGLE FOTOS"
            );

            const googleImages =
                await searchGooglePhotos(
                    query
                );

            let stickers =
                [];

            if (
                googleImages.length
            ) {
                stickers =
                    await processGooglePhotos(
                        googleImages
                    );
            }

            console.log("");
            console.log(
                `📸 Google Fotos forneceu: ${stickers.length}/${TOTAL_STICKERS}`
            );

            // ==================================================
            // 2. PINTEREST FALLBACK
            // ==================================================

            if (
                stickers.length <
                TOTAL_STICKERS
            ) {
                const faltam =
                    TOTAL_STICKERS -
                    stickers.length;

                console.log("");
                console.log(
                    "=============================================="
                );
                console.log(
                    `🛟 FALLBACK PINTEREST: faltam ${faltam}`
                );
                console.log(
                    "=============================================="
                );

                const pins =
                    await searchPinterest(
                        query
                    );

                console.log(
                    `📌 Total de candidatos Pinterest: ${pins.length}`
                );

                if (
                    pins.length
                ) {
                    const shuffledPins =
                        shuffle(
                            pins
                        );

                    stickers =
                        await processPinterestCandidates(
                            shuffledPins,
                            stickers
                        );
                }
            }

            // ==================================================
            // RESULTADO
            // ==================================================

            console.log("");
            console.log(
                "=============================================="
            );
            console.log(
                `📦 RESULTADO: ${stickers.length}/${TOTAL_STICKERS}`
            );
            console.log(
                "=============================================="
            );

            if (
                !stickers.length
            ) {
                return sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
                            "❌ Não consegui encontrar nenhuma imagem válida para esse pack."
                    },
                    {
                        quoted: msg
                    }
                );
            }

            if (
                stickers.length <
                TOTAL_STICKERS
            ) {
                console.log(
                    `⚠️ Não foi possível chegar aos ${TOTAL_STICKERS}.`
                );

                console.log(
                    `📦 Enviando mesmo assim: ${stickers.length} stickers`
                );
            }

            // ==================================================
            // ENVIAR PACK
            // ==================================================

            await sendStickerPack(
                sock,
                msg.key.remoteJid,
                stickers.slice(
                    0,
                    TOTAL_STICKERS
                ),
                {
                    name:
                        query,

                    publisher:
                        "Chiru-san Bot",

                    description:
                        "🌸 Chiru-san Bot"
                }
            );

            console.log(
                `✅ Pack enviado com ${stickers.length} stickers`
            );

        } catch (err) {
            console.error(
                "❌ Erro no .pack:",
                err
            );

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
                        `❌ Deu erro no pack:\n${err.message}`
                },
                {
                    quoted: msg
                }
            );
        }
    }
};
