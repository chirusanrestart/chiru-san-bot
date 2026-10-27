import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runFFmpegSticker } from "./ffmpeg.js";
import webp from "node-webpmux";
import { trySharpSticker } from "./sharpSticker.js";

const execFileAsync = promisify(execFile);

async function removeTemporaryFile(path) {
    try {
        await unlink(path);
    } catch {}
}

async function prepareImageForSticker(input, output) {
    const squareInput = `${output}.square.png`;

    await removeTemporaryFile(squareInput);

    try {
        // Normalize rectangular still images to an exact square before the
        // legacy backend runs its 512x512 crop. This prevents image content
        // from being cropped by that later filter.
        await execFileAsync("ffmpeg", [
            "-y",
            "-i", input,
            "-vf", "scale=512:512",
            "-frames:v", "1",
            "-an",
            squareInput
        ], {
            maxBuffer: 16 * 1024 * 1024
        });

        return squareInput;
    } catch (error) {
        await removeTemporaryFile(squareInput);
        throw error;
    }
}

export async function addStickerMetadataBuffer(buffer, packname = "Figurinhas", author = "Melissa") {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chiru-sticker-exif-"));
    const file = path.join(directory, "sticker.webp");
    try {
        await writeFile(file, Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
        const img = new webp.Image();
        await img.load(file);
        img.exif = createExif(
            String(packname || "Figurinhas").trim().slice(0, 128) || "Figurinhas",
            String(author || "Melissa").trim().slice(0, 128) || "Melissa"
        );
        await img.save(file);
        return await readFile(file);
    } finally {
        await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
}

function createExif(packname, author) {
    const json = {
        "sticker-pack-id": "chiru-san-bot",
        "sticker-pack-name": packname,
        "sticker-pack-publisher": author,
        "emojis": [
            "🌸"
        ]
    };

    const jsonBuff = Buffer.from(
        JSON.stringify(json),
        "utf-8"
    );

    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2a, 0x00,
        0x08, 0x00,
        0x00, 0x00,
        0x01, 0x00,
        0x41, 0x57,
        0x07, 0x00,
        0x00, 0x00,
        0x00, 0x00,
        0x16, 0x00,
        0x00, 0x00
    ]);

    const exif = Buffer.concat([
        exifAttr,
        jsonBuff
    ]);

    exif.writeUIntLE(
        jsonBuff.length,
        14,
        4
    );

    return exif;
}

export async function createSticker(
    input,
    output,
    metadata,
    type = "image"
) {
    let stickerInput = input;
    let temporaryInput = null;

    try {
        // Sharp é uma opção rápida para imagens estáticas quando instalado.
        // Vídeos/GIFs e ambientes incompatíveis continuam no pipeline antigo.
        let convertedWithSharp = false;
        if (type !== "video") {
            convertedWithSharp = await trySharpSticker(input, output, 80);
        }

        if (!convertedWithSharp) {
            // Keep the existing animated-video path unchanged.
            if (type !== "video") {
                temporaryInput = await prepareImageForSticker(input, output);
                stickerInput = temporaryInput;
            }

            await runFFmpegSticker(
                stickerInput,
                output,
                type
            );
        }

        const img = new webp.Image();

        await img.load(output);

        img.exif = createExif(
            metadata.packname,
            metadata.author
        );

        await img.save(output);

        return output;
    } finally {
        if (temporaryInput) {
            await removeTemporaryFile(temporaryInput);
        }
    }
}
