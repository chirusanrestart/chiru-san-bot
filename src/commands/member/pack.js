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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = a => [...a].sort(() => Math.random() - 0.5);
const isAnimated = url => /\.gif(?:[?#]|$)/i.test(String(url || ""));

async function googlePhotos(query) {
    try { return await searchMasterGooglePhotos(query); }
    catch (e) { console.log("⚠️ Google Fotos:", e.message); return []; }
}

async function pinterestSearch(query) {
    const pins = new Set();
    const headers = { "User-Agent": "Mozilla/5.0", Accept: "text/html" };

    const searchPage = async page => {
        const url = "https://www.pinterest.com/search/pins/?q=" + encodeURIComponent(query) + (page > 1 ? "&page=" + page : "");
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
    };

    for (let page = 1; page <= 5 && pins.size < 180; page++) {
        try {
            const html = await searchPage(page);
            for (const re of [
                /https?:\/\/(?:www\.)?pinterest\.[a-z.]+\/pin\/(\d+)/gi,
                /["']\/pin\/(\d+)/gi,
                /["'](?:id|pinId)["']\s*:\s*["'](\d{6,})["']/gi
            ]) {
                let m;
                while ((m = re.exec(html))) pins.add("https://www.pinterest.com/pin/" + m[1] + "/");
            }
        } catch (e) { console.log("⚠️ Pinterest:", e.message); break; }
        await sleep(100);
    }

    const list = [...pins];
    const out = [];
    let i = 0;

    async function worker() {
        while (i < list.length && out.length < 120) {
            const pin = list[i++];
            try {
                const res = await fetch(pin, { headers });
                if (!res.ok) continue;
                const html = await res.text();
                const match =
                    html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)/i) ||
                    html.match(/https?:\/\/i\.pinimg\.com\/[^"'\s]+/i);
                const imageUrl = match?.[1] || match?.[0];
                if (imageUrl) out.push({
                    url: imageUrl.replace(/&amp;/g, "&").replace(/\\u002F/g, "/").replace(/\\\//g, "/"),
                    source: "pinterest",
                    animated: isAnimated(match[1])
                });
            } catch {}
            await sleep(100);
        }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return out;
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
    if (all.length < TOTAL * 2) add(await pinterestSearch(query));

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