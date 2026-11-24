import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const MAX_CARD_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
]);

export function cleanWeddingName(value, fallback = "Pessoa") {
    return String(value || fallback)
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 32) || fallback;
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function getInitial(value) {
    return Array.from(cleanWeddingName(value))[0]?.toLocaleUpperCase("pt-BR") || "?";
}

function getPhotoDataUri(photo) {
    if (!photo?.buffer || !photo?.mimeType) return null;

    const mimeType = String(photo.mimeType).toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) return null;

    const buffer = Buffer.isBuffer(photo.buffer)
        ? photo.buffer
        : Buffer.from(photo.buffer);

    if (!buffer.length || buffer.length > 5 * 1024 * 1024) return null;
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function renderPortrait({ photo, clipId, x, centerX, name }) {
    const dataUri = getPhotoDataUri(photo);
    const y = 463;
    const size = 294;
    const initial = escapeXml(getInitial(name));

    const portrait = dataUri
        ? `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${dataUri}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`
        : `<circle cx="${centerX}" cy="610" r="147" fill="#f8dce8"/>
           <text x="${centerX}" y="630" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="112" font-weight="700" fill="#a34f75">${initial}</text>`;

    return `
        <circle cx="${centerX}" cy="610" r="166" fill="#fff" stroke="#d889a8" stroke-width="10"/>
        ${portrait}
        <circle cx="${centerX}" cy="610" r="148" fill="none" stroke="#fff" stroke-width="7"/>
        <circle cx="${centerX}" cy="610" r="174" fill="none" stroke="#f3c9d9" stroke-width="4"/>
    `;
}

export function buildWeddingCardSvg({
    firstName,
    secondName,
    firstPhoto = null,
    secondPhoto = null,
    date
}) {
    const safeFirstName = escapeXml(cleanWeddingName(firstName, "Pessoa 1"));
    const safeSecondName = escapeXml(cleanWeddingName(secondName, "Pessoa 2"));
    const safeDate = escapeXml(String(date || "").slice(0, 80));

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff5f8"/>
      <stop offset="52%" stop-color="#ffe4ee"/>
      <stop offset="100%" stop-color="#fcecf4"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fffdfd"/>
      <stop offset="100%" stop-color="#fff7fa"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f4d99a"/>
      <stop offset="50%" stop-color="#d6ad62"/>
      <stop offset="100%" stop-color="#f1d49a"/>
    </linearGradient>
    <clipPath id="firstPortrait">
      <circle cx="320" cy="610" r="147"/>
    </clipPath>
    <clipPath id="secondPortrait">
      <circle cx="760" cy="610" r="147"/>
    </clipPath>
  </defs>

  <rect width="1080" height="1350" fill="url(#background)"/>
  <circle cx="82" cy="175" r="90" fill="#fff" opacity=".35"/>
  <circle cx="1000" cy="280" r="130" fill="#fff" opacity=".28"/>
  <circle cx="90" cy="1160" r="115" fill="#f6c8da" opacity=".22"/>
  <circle cx="1000" cy="1100" r="150" fill="#f6c8da" opacity=".22"/>

  <g fill="#eaa8c0" opacity=".7">
    <path d="M140 340c-22-18-18-47 5-49 18-2 27 18 27 18s10-20 28-18c23 2 27 31 5 49l-33 28z"/>
    <path d="M930 420c-18-15-15-38 4-40 15-2 22 15 22 15s8-17 23-15c19 2 22 25 4 40l-27 23z"/>
    <path d="M170 1020c-17-14-14-36 4-38 14-1 21 14 21 14s8-15 22-14c18 2 21 24 4 38l-25 22z"/>
    <path d="M900 1040c-17-14-14-36 4-38 14-1 21 14 21 14s8-15 22-14c18 2 21 24 4 38l-25 22z"/>
  </g>

  <rect x="48" y="48" width="984" height="1254" rx="48" fill="url(#panel)" stroke="#df9ab4" stroke-width="5"/>
  <rect x="67" y="67" width="946" height="1216" rx="36" fill="none" stroke="url(#gold)" stroke-width="3"/>

  <text x="540" y="172" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="26" letter-spacing="7" fill="#b56b87">CERTIDÃO DIGITAL</text>
  <text x="540" y="262" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="67" font-weight="700" letter-spacing="1" fill="#87415f">CASAMENTO VIRTUAL</text>
  <path d="M285 302H795" stroke="url(#gold)" stroke-width="4" stroke-linecap="round"/>
  <text x="540" y="355" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="27" fill="#a66c84">Uma união celebrada pelo Chiru-san Bot</text>

  ${renderPortrait({ photo: firstPhoto, clipId: "firstPortrait", x: 173, centerX: 320, name: firstName })}
  ${renderPortrait({ photo: secondPhoto, clipId: "secondPortrait", x: 613, centerX: 760, name: secondName })}

  <path d="M540 575c-29-38-83-17-78 25 4 31 39 57 78 94 39-37 74-63 78-94 5-42-49-63-78-25z" fill="#e77ca2" stroke="#fff" stroke-width="8"/>
  <path d="M540 595c-13-16-35-8-33 11 1 13 16 24 33 40 17-16 32-27 33-40 2-19-20-27-33-11z" fill="#fff1f6"/>

  <text x="320" y="850" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="37" font-weight="700" fill="#82445e" textLength="350" lengthAdjust="spacingAndGlyphs">${safeFirstName}</text>
  <text x="760" y="850" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="37" font-weight="700" fill="#82445e" textLength="350" lengthAdjust="spacingAndGlyphs">${safeSecondName}</text>
  <text x="540" y="925" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="28" fill="#c07191">♡  unidos pelo destino digital  ♡</text>

  <path d="M220 1000H860" stroke="#f0d2de" stroke-width="3" stroke-linecap="round"/>
  <text x="540" y="1075" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="31" font-weight="700" fill="#95536e">Que nunca faltem carinho, risadas</text>
  <text x="540" y="1120" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="31" font-weight="700" fill="#95536e">e muitos memes nessa união!</text>
  <text x="540" y="1204" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="24" fill="#b27b91">${safeDate}</text>
  <text x="540" y="1255" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="19" letter-spacing="3" fill="#c18aa0">COM CARINHO • CHIRU-SAN BOT</text>
</svg>`;
}

function getPhotoBuffer(photo) {
    if (!photo?.buffer || !photo?.mimeType) return null;

    const mimeType = String(photo.mimeType).toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) return null;

    const buffer = Buffer.isBuffer(photo.buffer)
        ? photo.buffer
        : Buffer.from(photo.buffer);

    if (!buffer.length || buffer.length > 5 * 1024 * 1024) return null;
    return { buffer, mimeType };
}

async function findFont(candidates) {
    for (const candidate of candidates.filter(Boolean)) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {}
    }

    throw new Error("Não encontrei uma fonte TrueType compatível para montar a arte.");
}

function escapeFilterPath(value) {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'");
}

function drawTextFilter(filePath, fontPath, fontSize, color, x, y) {
    return `drawtext=fontfile='${escapeFilterPath(fontPath)}':textfile='${escapeFilterPath(filePath)}':expansion=none:fontsize=${fontSize}:fontcolor=${color}:x=${x}:y=${y}`;
}

export async function renderWeddingCardWithFfmpeg({
    firstName = "Pessoa 1",
    secondName = "Pessoa 2",
    firstPhoto = null,
    secondPhoto = null,
    date = ""
} = {}) {
    const prefix = process.env.PREFIX || "";
    const regularFont = await findFont([
        "/system/fonts/Roboto-Regular.ttf",
        "/system/fonts/Roboto.ttf",
        path.join(prefix, "share/fonts/TTF/DejaVuSans.ttf"),
        path.join(prefix, "share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"
    ]);
    const boldFont = await findFont([
        "/system/fonts/Roboto-Bold.ttf",
        path.join(prefix, "share/fonts/TTF/DejaVuSans-Bold.ttf"),
        path.join(prefix, "share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
        regularFont
    ]);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chiru-casar-"));

    try {
        const textFiles = new Map();

        async function writeTextFile(key, value) {
            const filePath = path.join(directory, `${key}.txt`);
            await fs.writeFile(
                filePath,
                cleanWeddingName(value, "").replace(/[\r\n]+/g, " ").slice(0, 100),
                "utf8"
            );
            textFiles.set(key, filePath);
            return filePath;
        }

        const firstLabel = cleanWeddingName(firstName, "Pessoa 1");
        const secondLabel = cleanWeddingName(secondName, "Pessoa 2");
        const firstData = getPhotoBuffer(firstPhoto);
        const secondData = getPhotoBuffer(secondPhoto);
        const avatarData = [firstData, secondData];
        const avatarPositions = [173, 613];
        const avatarNames = ["first", "second"];

        const textValues = {
            certificate: "CERTIDÃO DIGITAL",
            title: "CASAMENTO VIRTUAL",
            subtitle: "Uma união celebrada pelo Chiru-san Bot",
            firstName: firstLabel,
            secondName: secondLabel,
            heart: "♥",
            union: "♡  unidos pelo destino digital  ♡",
            lineOne: "Que nunca faltem carinho, risadas",
            lineTwo: "e muitos memes nessa união!",
            date: String(date || "").slice(0, 80),
            footer: "COM CARINHO • CHIRU-SAN BOT",
            firstInitial: getInitial(firstLabel),
            secondInitial: getInitial(secondLabel)
        };

        for (const [key, value] of Object.entries(textValues)) {
            await writeTextFile(key, value);
        }

        const baseFilters = [
            "drawbox=x=48:y=48:w=984:h=1254:color=0xDF9AB4:t=5",
            "drawbox=x=67:y=67:w=946:h=1216:color=0xD6AD62:t=3",
            "drawbox=x=154:y=444:w=332:h=332:color=0xFFFFFF:t=fill",
            "drawbox=x=594:y=444:w=332:h=332:color=0xFFFFFF:t=fill"
        ];

        const filters = [];
        let currentLabel = "card0";
        filters.push(`[0:v]${baseFilters.join(",")}[${currentLabel}]`);

        const inputArgs = [];
        let inputIndex = 1;

        for (let index = 0; index < avatarData.length; index++) {
            const photo = avatarData[index];

            if (!photo) {
                const initialKey = index === 0 ? "firstInitial" : "secondInitial";
                const center = index === 0 ? 320 : 760;
                const color = "0xA34F75";
                const filePath = textFiles.get(initialKey);
                const initialFilter = drawTextFilter(
                    filePath,
                    boldFont,
                    112,
                    color,
                    `${center}-text_w/2`,
                    "555"
                );
                filters.push(`[${currentLabel}]${initialFilter}[${currentLabel}placeholder]`);
                currentLabel = `${currentLabel}placeholder`;
                continue;
            }

            const extension = photo.mimeType === "image/png"
                ? "png"
                : photo.mimeType === "image/webp"
                    ? "webp"
                    : "jpg";
            const photoPath = path.join(directory, `${avatarNames[index]}.${extension}`);
            await fs.writeFile(photoPath, photo.buffer);

            inputArgs.push("-loop", "1", "-framerate", "1", "-i", photoPath);

            const avatarLabel = `avatar${index}`;
            const cardLabel = `card${index + 1}`;
            filters.push(
                `[${inputIndex}:v]scale=294:294:force_original_aspect_ratio=increase,crop=294:294,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(pow(X-147,2)+pow(Y-147,2),pow(147,2)),255,0)'[${avatarLabel}]`
            );
            filters.push(
                `[${currentLabel}][${avatarLabel}]overlay=${avatarPositions[index]}:463:shortest=1[${cardLabel}]`
            );

            currentLabel = cardLabel;
            inputIndex++;
        }

        const drawText = (key, font, size, color, x, y) => drawTextFilter(
            textFiles.get(key),
            font,
            size,
            color,
            x,
            y
        );

        const nameFontSize = value => value.length > 23 ? 25 : value.length > 16 ? 31 : 38;
        const finalTextFilters = [
            drawText("certificate", regularFont, 26, "0xB56B87", "(w-text_w)/2", "140"),
            drawText("title", boldFont, 64, "0x87415F", "(w-text_w)/2", "225"),
            drawText("subtitle", regularFont, 25, "0xA66C84", "(w-text_w)/2", "330"),
            drawText("heart", boldFont, 82, "0xE77CA2", "(w-text_w)/2", "580"),
            drawText("firstName", boldFont, nameFontSize(firstLabel), "0x82445E", "320-text_w/2", "825"),
            drawText("secondName", boldFont, nameFontSize(secondLabel), "0x82445E", "760-text_w/2", "825"),
            drawText("union", regularFont, 27, "0xC07191", "(w-text_w)/2", "900"),
            drawText("lineOne", boldFont, 30, "0x95536E", "(w-text_w)/2", "1050"),
            drawText("lineTwo", boldFont, 30, "0x95536E", "(w-text_w)/2", "1100"),
            drawText("date", regularFont, 24, "0xB27B91", "(w-text_w)/2", "1180"),
            drawText("footer", regularFont, 18, "0xC18AA0", "(w-text_w)/2", "1235")
        ];

        filters.push(`[${currentLabel}]${finalTextFilters.join(",")},format=rgb24[out]`);

        const outputPath = path.join(directory, "casamento.png");
        const filterGraph = filters.join(";");

        // O fallback usa apenas os filtros básicos do FFmpeg, sem depender de
        // suporte SVG/librsvg, que não está presente em todas as builds Android.
        await execFileAsync("ffmpeg", [
            "-hide_banner",
            "-loglevel", "error",
            "-y",
            "-filter_complex_threads", "1",
            "-f", "lavfi",
            "-i", "color=c=0xFFF5F8:s=1080x1350:d=1:r=1",
            ...inputArgs,
            "-filter_complex", filterGraph,
            "-map", "[out]",
            "-frames:v", "1",
            "-f", "image2",
            outputPath
        ], {
            timeout: 25000,
            maxBuffer: 4 * 1024 * 1024
        });

        const image = await fs.readFile(outputPath);
        if (!image.length || image.length > MAX_CARD_BYTES) {
            throw new Error("A arte gerada ficou vazia ou excedeu 8 MiB.");
        }
        return image;
    } finally {
        await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
}

export async function renderWeddingCard(svg, options = {}) {
    const sharpModule = await import("sharp").catch(() => null);
    if (sharpModule) {
        const sharp = sharpModule.default || sharpModule;
        try {
            const image = await sharp(Buffer.from(svg))
                .png({ compressionLevel: 9 })
                .toBuffer();

            if (image.length > 0 && image.length <= MAX_CARD_BYTES) {
                return image;
            }
            throw new Error("A imagem gerada ultrapassou o limite permitido.");
        } catch (error) {
            console.warn("[casar] Sharp indisponível para esta arte; tentando FFmpeg:", error?.message || error);
        }
    }

    return renderWeddingCardWithFfmpeg(options);
}
