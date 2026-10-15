import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const TIMEOUT_MS = 20_000;

function parseDimensions(value) {
    const match = /^(\d{1,4})x(\d{1,4})$/i.exec(String(value || ""));
    if (!match) {
        throw new Error("Formato inválido. Use, por exemplo, 1280x720.");
    }

    const width = Number(match[1]);
    const height = Number(match[2]);

    if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width < 1 ||
        height < 1 ||
        width > MAX_WIDTH ||
        height > MAX_HEIGHT
    ) {
        throw new Error("Resolução fora do limite. Use largura de 1 a 1920 e altura de 1 a 1080.");
    }

    return { width, height };
}

function runFFmpeg(args) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const child = spawn("ffmpeg", args, {
            stdio: ["ignore", "ignore", "pipe"],
            windowsHide: true
        });

        let stderr = "";
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, TIMEOUT_MS);
        timer.unref?.();

        child.stderr.on("data", chunk => {
            if (stderr.length < 4000) stderr += chunk.toString();
        });

        child.once("error", error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error.code === "ENOENT"
                ? new Error("FFmpeg não foi encontrado no PATH.")
                : new Error("Não foi possível iniciar o FFmpeg."));
        });

        child.once("close", code => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);

            if (timedOut) {
                reject(new Error("O processamento excedeu 20 segundos."));
            } else if (code !== 0) {
                reject(new Error(stderr.includes("max_pixels")
                    ? "A imagem excede o limite de pixels permitido."
                    : "O FFmpeg não conseguiu processar essa imagem."));
            } else {
                resolve();
            }
        });
    });
}

export async function upscaleImage(buffer, dimensionArg, preserveAspectRatio) {
    const { width, height } = parseDimensions(dimensionArg);

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error("Não consegui baixar uma imagem válida.");
    }
    if (buffer.length > MAX_INPUT_BYTES) {
        throw new Error("A imagem original ultrapassa o limite de 10 MB.");
    }

    const tempDir = path.resolve("./temp");
    await fs.mkdir(tempDir, { recursive: true });

    const id = randomUUID();
    const input = path.join(tempDir, `upscale-${id}.input`);
    const output = path.join(tempDir, `upscale-${id}.jpg`);

    try {
        await fs.writeFile(input, buffer, { flag: "wx" });

        const scaleFilter = preserveAspectRatio
            ? `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`
            : `scale=${width}:${height}:flags=lanczos`;

        await runFFmpeg([
            "-hide_banner",
            "-loglevel", "error",
            "-nostdin",
            "-y",
            "-threads", "2",
            "-max_pixels", String(MAX_INPUT_PIXELS),
            "-i", input,
            "-map", "0:v:0",
            "-frames:v", "1",
            "-vf", scaleFilter,
            "-q:v", "2",
            "-map_metadata", "-1",
            "-threads", "2",
            output
        ]);

        const info = await fs.stat(output);
        if (!info.isFile() || info.size < 1 || info.size > 15 * 1024 * 1024) {
            throw new Error("A imagem processada ficou vazia ou ultrapassou 15 MB.");
        }

        return await fs.readFile(output);
    } finally {
        await Promise.all([
            fs.unlink(input).catch(() => {}),
            fs.unlink(output).catch(() => {})
        ]);
    }
}
