import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { sendStickerPack } from "../../services/stickerPack.js";
import { searchMasterGooglePhotos } from "../../services/googlePhotosMaster.js";

const run = promisify(execFile);
const TOTAL = 60;
const CONCURRENCY = 3;
const MAX_IMAGE = 12 * 1024 * 1024;
const MAX_STICKER = 1024 * 1024;
const MAX_CANDIDATES = 180;
const MAX_SEARCH_PAGES = 5;
const MIN_DELAY = 100;
const MAX_DELAY = 200;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffle = a => [...a].sort(() => Math.random() - 0.5);
const isAnimated = url => /\.gif(?:[?#]|$)/i.test(String(url || ""));

async function googlePhotos(query) {
    try { return await searchMasterGooglePhotos(query); }
    catch (e) { console.log("⚠️ Google Fotos:", e.message); return []; }
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
        const html = await fetchPinterest(pinUrl);

        function getMeta(name) {
            const a = new RegExp(
                "<meta[^>]+(?:property|name)=[\\\"']" +
                name +
                "[\\\"'][^>]+content=[\\\"']([^\\\"']+)[\\\"']",
                "i"
            );

            const b = new RegExp(
                "<meta[^>]+content=[\\\"']([^\\\"']+)[\\\"'][^>]+(?:property|name)=[\\\"']" +
                name +
                "[\\\"']",
                "i"
            );

            return (
                html.match(a)?.[1] ||
                html.match(b)?.[1] ||
                ""
            )
                .replace(/&amp;/g, "&")
                .replace(/\\u002F/g, "/")
                .replace(/\\\//g, "/");
        }

        const imageUrl =
            getMeta("og:image") ||
            html.match(
                /https?:\/\/i\.pinimg\.com\/[^"'\\\s]+/gi
            )?.[0]
                ?.replace(/&amp;/g, "&")
                .replace(/\\u002F/g, "/")
                .replace(/\\\//g, "/");

        if (!imageUrl) return null;

        return {
            url: imageUrl,
            title:
                getMeta("og:title") ||
                getMeta("twitter:title"),
            description:
                getMeta("og:description") ||
                getMeta("description") ||
                getMeta("twitter:description"),
            pinUrl
        };
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

            if (imgUrl?.url) {
                images.push({
                    url: imgUrl.url,
                    source: "pinterest",
                    animated: isAnimated(imgUrl.url),
                    title: imgUrl.title,
                    description: imgUrl.description,
                    pinUrl: imgUrl.pinUrl
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


async function findImages(query) {
    const all = [];
    const seen = new Set();

    const add = list => {
        for (const x of list || []) {
            if (!x?.url || seen.has(x.url)) continue;
            seen.add(x.url);
            all.push({ ...x, animated: x.animated || isAnimated(x.url) });
        }
    };

    add(await googlePhotos(query));
    if (all.length < TOTAL * 2) {
        const pins = await searchPinterest(query);
        add(await resolvePinterestImages(pins, Math.max(TOTAL * 2, 80)));
    }

    const selected = [
        ...shuffle(all.filter(x => x.animated)).slice(0, 30),
        ...shuffle(all.filter(x => !x.animated)).slice(0, 30)
    ];

    for (const x of shuffle(all)) {
        if (selected.length >= TOTAL) break;
        if (!selected.some(y => y.url === x.url)) selected.push(x);
    }

    return shuffle(selected).slice(0, TOTAL);
}

async function download(url, file) {
    const res = await fetch(url, { headers: { "User-Agent": "chiru-san-bot/1.0" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE) throw new Error("imagem muito grande");
    await fs.writeFile(file, buf);
}

async function convert(input, output, animated) {
    const filter = "scale=512:512";
    const encode = async (quality, fps) => {
        const vf = animated ? `fps=${fps},${filter}` : filter;
        const args = ["-y", "-i", input, "-vf", vf, "-an", "-c:v", "libwebp", "-quality", String(quality), "-compression_level", "4"];
        if (animated) args.push("-loop", "0", "-t", "15");
        args.push(output);
        await run("ffmpeg", args);
    };

    await encode(animated ? 70 : 80, animated ? 12 : 1);
    if ((await fs.stat(output)).size > MAX_STICKER) {
        await encode(animated ? 45 : 55, animated ? 8 : 1);
        if ((await fs.stat(output)).size > MAX_STICKER) throw new Error("sticker maior que 1 MB");
    }
}

async function makeStickers(items, dir) {
    const out = [];
    let index = 0;

    async function worker() {
        while (index < items.length && out.length < TOTAL) {
            const item = items[index++];
            const id = randomUUID();
            const input = path.join(dir, id + ".img");
            const output = path.join(dir, id + ".webp");

            try {
                await download(item.url, input);
                await convert(input, output, item.animated);
                const buf = await fs.readFile(output);
                if (buf.length <= MAX_STICKER) {
                    out.push(buf);
                    console.log(`✅ ${out.length}/${TOTAL}`);
                }
            } catch (e) {
                console.log("⚠️ Imagem:", e.message);
            } finally {
                await fs.unlink(input).catch(() => {});
                await fs.unlink(output).catch(() => {});
            }
        }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return out.slice(0, TOTAL);
}

export default {
    name: "pack",
    aliases: ["stickerpack", "figpack"],
    description: "Gera pack de stickers",
    async execute(sock, msg, args) {
        const query = (args || []).join(" ").trim();
        const from = msg.key.remoteJid;

        if (!query)
            return sock.sendMessage(from, { text: "Use: *.pack nome do personagem*" }, { quoted: msg });

        await sock.sendMessage(from, {
            text: `🔎 Montando pack de *${query}* (até ${TOTAL} figs)...`
        }, { quoted: msg });

        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pack-"));

        try {
            const candidates = await findImages(query);
            if (!candidates.length)
                return sock.sendMessage(from, { text: `❌ Não achei imagens pra *${query}*.` }, { quoted: msg });

            const stickers = await makeStickers(candidates, dir);
            if (stickers.length < 5)
                return sock.sendMessage(from, { text: `❌ Só consegui *${stickers.length}* figurinhas pra *${query}*.` }, { quoted: msg });

            await sendStickerPack(sock, from, stickers, {
                name: query,
                publisher: "Chiru-san Bot",
                description: `🌸 ${query}`
            });

            await sock.sendMessage(from, {
                text: `✅ Pack *${query}* pronto (*${stickers.length}* figs)`
            }, { quoted: msg });
        } catch (e) {
            console.error("pack error:", e);
            await sock.sendMessage(from, {
                text: `❌ Erro ao montar o pack: ${e.message}`
            }, { quoted: msg });
        } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
    }
};