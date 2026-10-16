import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { sendStickerPack } from "../../services/stickerPack.js";
import { enqueuePack } from "../../services/packQueue.js";
import { searchMasterGooglePhotos } from "../../services/googlePhotosMaster.js";
import { searchPinterest } from "../../services/pinterestScraper.js";
import webp from "node-webpmux";
import { runFFmpegSticker } from "../../services/ffmpeg.js";
import { tryTurboJpegSticker } from "../../services/turbojpeg.js";

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
        const pins = await searchPinterest(query, Math.max(TOTAL * 2, 80));
        add(pins.map(pin => ({ ...pin, source: "pinterest" })));
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

let cachedYtDlpCommand = null;

// Resolve yt-dlp sem presumir que o executável fica dentro da pasta do bot.
// No Termux, a instalação via pip normalmente funciona com "python -m yt_dlp".
async function locateYtDlp() {
    if (cachedYtDlpCommand) {
        try {
            await run(cachedYtDlpCommand.command, [...cachedYtDlpCommand.prefixArgs, "--version"], {
                timeout: 10000,
                maxBuffer: 1024 * 1024
            });
            return cachedYtDlpCommand;
        } catch {
            cachedYtDlpCommand = null;
        }
    }

    const candidates = [];
    const add = (command, prefixArgs = []) => {
        if (!command) return;
        const key = command + "\\0" + prefixArgs.join("\\0");
        if (!candidates.some(item => item.key === key)) {
            candidates.push({ key, command, prefixArgs });
        }
    };

    add(process.env.YT_DLP_PATH);
    add("yt-dlp");
    add("yt-dlp.exe");
    add("python", ["-m", "yt_dlp"]);
    add("python3", ["-m", "yt_dlp"]);
    add(process.env.PYTHON, ["-m", "yt_dlp"]);
    add(process.env.PREFIX ? path.join(process.env.PREFIX, "bin", "python") : null, ["-m", "yt_dlp"]);
    add("/data/data/com.termux/files/usr/bin/python", ["-m", "yt_dlp"]);
    add("/data/data/com.termux/files/usr/bin/python3", ["-m", "yt_dlp"]);

    const errors = [];
    for (const candidate of candidates) {
        try {
            await run(candidate.command, [...candidate.prefixArgs, "--version"], {
                timeout: 10000,
                maxBuffer: 1024 * 1024
            });
            cachedYtDlpCommand = candidate;
            console.log("✅ yt-dlp localizado:", candidate.prefixArgs.length
                ? candidate.command + " " + candidate.prefixArgs.join(" ")
                : candidate.command);
            return candidate;
        } catch (e) {
            errors.push(candidate.command + (candidate.prefixArgs.length ? " " + candidate.prefixArgs.join(" ") : "") + ": " + (e.code || e.message));
        }
    }

    throw new Error("não encontrei yt-dlp. Instale com 'python -m pip install -U yt-dlp' ou defina YT_DLP_PATH. Tentativas: " + errors.join("; "));
}

async function downloadWithYtDlp(pinUrl, file) {
    if (!pinUrl) throw new Error("pin sem URL de origem");

    const resolved = await locateYtDlp();
    const outputTemplate = file + ".%(ext)s";

    await run(resolved.command, [
        ...resolved.prefixArgs,
        "--no-warnings",
        "--no-playlist",
        "--no-part",
        "--no-overwrites",
        "-o", outputTemplate,
        pinUrl
    ], { timeout: 45000, maxBuffer: 4 * 1024 * 1024 });

    const dir = path.dirname(file);
    const prefix = path.basename(file) + ".";
    const entries = await fs.readdir(dir);
    const downloaded = entries
        .filter(name => name.startsWith(prefix))
        .map(name => path.join(dir, name));

    if (!downloaded.length) throw new Error("yt-dlp não gerou arquivo");
    const source = downloaded[0];
    const stat = await fs.stat(source);
    if (!stat.isFile() || stat.size === 0) throw new Error("yt-dlp gerou arquivo vazio");
    if (stat.size > MAX_IMAGE) {
        await fs.unlink(source).catch(() => {});
        throw new Error("imagem muito grande");
    }

    await fs.rename(source, file);
    for (const extra of downloaded.slice(1)) await fs.unlink(extra).catch(() => {});
}

async function download(url, file, pinUrl) {
    // O scraper pode retornar IDs internos opacos, que não são URLs públicas
    // válidas de pins. Só entrega ao yt-dlp links com ID numérico real.
    // Para os demais casos, preserva a URL direta da imagem como caminho principal.
    const validPublicPinUrl = typeof pinUrl === "string"
        && /^https?:\/\/(?:www\.)?pinterest\.com\/pin\/\d+\/?(?:[?#].*)?$/i.test(pinUrl);

    // Primeiro tenta yt-dlp apenas com URLs públicas válidas; em caso de falha,
    // mantém o fallback existente para baixar a imagem diretamente.
    if (validPublicPinUrl) {
        try {
            await downloadWithYtDlp(pinUrl, file);
            return;
        } catch (e) {
            console.log("⚠️ yt-dlp Pinterest; tentando imagem direta:", e.message);
            await fs.unlink(file).catch(() => {});
            const dir = path.dirname(file);
            const prefix = path.basename(file) + ".";
            for (const name of await fs.readdir(dir)) {
                if (name.startsWith(prefix)) await fs.unlink(path.join(dir, name)).catch(() => {});
            }
        }
    }

    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36",
            Referer: "https://www.pinterest.com/"
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("imagem vazia");
    if (buf.length > MAX_IMAGE) throw new Error("imagem muito grande");
    await fs.writeFile(file, buf);
}

async function convert(input, output, animated) {
    // JPEG estático: tenta TurboJPEG para decodificar/cortar e cwebp para
    // redimensionar/encodar. Se não estiver compilado ou falhar, usa FFmpeg.
    if (!animated) {
        if (await tryTurboJpegSticker(input, output, 80)) {
            if ((await fs.stat(output)).size <= MAX_STICKER) return;

            await fs.unlink(output).catch(() => {});
            if (await tryTurboJpegSticker(input, output, 55)) {
                if ((await fs.stat(output)).size <= MAX_STICKER) return;
                await fs.unlink(output).catch(() => {});
            }
        }
    }

    const encode = async (quality, fps) => {
        await runFFmpegSticker(input, output, animated ? "video" : "image", {
            quality,
            fps,
            duration: 15
        });
    };

    await encode(animated ? 70 : 80, animated ? 12 : 1);
    if ((await fs.stat(output)).size > MAX_STICKER) {
        await fs.unlink(output).catch(() => {});
        await encode(animated ? 45 : 55, animated ? 8 : 1);
        if ((await fs.stat(output)).size > MAX_STICKER) {
            throw new Error("sticker maior que 1 MB");
        }
    }
}

function createStickerExif(packname, author) {
    const json = Buffer.from(JSON.stringify({
        "sticker-pack-id": "chiru san bot",
        "sticker-pack-name": packname,
        "sticker-pack-publisher": author,
        emojis: ["🌸"]
    }), "utf-8");

    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2a, 0x00,
        0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57,
        0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00,
        0x00, 0x00
    ]);

    const exif = Buffer.concat([exifAttr, json]);
    exif.writeUIntLE(json.length, 14, 4);
    return exif;
}

async function addStickerMetadata(file, packname, author) {
    const img = new webp.Image();
    await img.load(file);
    img.exif = createStickerExif(packname, author);
    await img.save(file);
}

async function makeStickers(items, dir, packname, author) {
    const out = [];
    let index = 0;

    async function worker() {
        while (index < items.length && out.length < TOTAL) {
            const item = items[index++];
            const id = randomUUID();
            const input = path.join(dir, id + ".img");
            const output = path.join(dir, id + ".webp");

            try {
                await download(item.url, input, item.pinUrl);
                await convert(input, output, item.animated);
                await addStickerMetadata(output, packname, author);
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

        if (!query) {
            return sock.sendMessage(
                from,
                { text: "Use: *.pack nome do personagem*" },
                { quoted: msg }
            );
        }

        const requester = String(
            msg.pushName || msg.verifiedBizName || "usuário"
        ).trim();

        return enqueuePack(async ({ id }) => {
            let dir;

            try {
                dir = await fs.mkdtemp(path.join(os.tmpdir(), "pack-"));

                await sock.sendMessage(from, {
                    text: `🔎 Começando o pack de *${query}* (até ${TOTAL} figs)...`
                }, { quoted: msg });

                console.log(`📦 [pack ${id}] Iniciando "${query}" solicitado por ${requester}`);

                const candidates = await findImages(query);
                if (!candidates.length) {
                    await sock.sendMessage(from, {
                        text: `❌ Não achei imagens pra *${query}*.`
                    }, { quoted: msg });
                    return;
                }

                const author = `Chiru san bot • ${requester}`;
                const stickers = await makeStickers(candidates, dir, query, author);

                if (stickers.length < 5) {
                    await sock.sendMessage(from, {
                        text: `❌ Só consegui *${stickers.length}* figurinhas pra *${query}*.`
                    }, { quoted: msg });
                    return;
                }

                await sendStickerPack(sock, from, stickers, {
                    name: query,
                    publisher: author,
                    description: `🌸 ${query}`
                });

                await sock.sendMessage(from, {
                    text: `✅ Pack *${query}* pronto (*${stickers.length}* figs)`
                }, { quoted: msg });

                console.log(`✅ [pack ${id}] Concluído "${query}" (${stickers.length} stickers)`);
            } catch (e) {
                console.error(`❌ [pack ${id}] Erro em "${query}":`, e);

                try {
                    await sock.sendMessage(from, {
                        text: `❌ Erro ao montar o pack *${query}*: ${e.message || "erro desconhecido"}`
                    }, { quoted: msg });
                } catch (sendError) {
                    console.error(`❌ [pack ${id}] Também falhou ao avisar o usuário:`, sendError);
                }

                throw e;
            } finally {
                if (dir) {
                    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
                }
            }
        }, {
            onQueued: ({ id, position }) => sock.sendMessage(from, {
                text: position === 1
                    ? `📥 Pack *${query}* entrou na fila e será iniciado em breve. (ID: ${id})`
                    : `📥 Pack *${query}* entrou na fila na posição *${position}*. (ID: ${id})`
            }, { quoted: msg })
        });
    }
};