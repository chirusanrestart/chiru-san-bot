import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";

const execFile = promisify(execFileCallback);

export function buildGifPlaybackArgs(input, output, duration = 6) {
    const seconds = Number(duration);

    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 6) {
        throw new RangeError("A duração do GIF precisa ficar entre 1 e 6 segundos.");
    }

    if (typeof input !== "string" || !input.trim()) {
        throw new TypeError("O arquivo de entrada do GIF é inválido.");
    }

    if (typeof output !== "string" || !output.trim()) {
        throw new TypeError("O arquivo de saída do GIF é inválido.");
    }

    return [
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", input,
        "-t", String(seconds),
        "-vf", "fps=12,scale=480:480:force_original_aspect_ratio=decrease:flags=lanczos",
        "-an",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "28",
        "-threads", "2",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output
    ];
}

export async function convertVideoToGifPlayback(input, output, { duration = 6 } = {}) {
    const args = buildGifPlaybackArgs(input, output, duration);

    await execFile("ffmpeg", args, {
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true
    });

    const outputInfo = await stat(output);
    if (!outputInfo.isFile() || outputInfo.size === 0) {
        throw new Error("O FFmpeg não gerou um vídeo GIF válido.");
    }

    return output;
}
