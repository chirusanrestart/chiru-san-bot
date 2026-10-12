import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFFmpegSticker } from "./ffmpeg.js";

const execFileAsync = promisify(execFile);
const EXEC_OPTIONS = {
    maxBuffer: 16 * 1024 * 1024
};

async function removeOutput(output) {
    try {
        await unlink(output);
    } catch {}
}

function debugError(error) {
    if (process.env.FFMPEG_DEBUG !== "1") return;

    console.log(
        error?.stderr ||
        error?.stdout ||
        error?.message ||
        ""
    );
}

/**
 * Codifica figurinhas estáticas com cwebp -mt depois do caminho Vulkan.
 * Se Vulkan ou cwebp falhar, volta ao pipeline FFmpeg já existente.
 * O arquivo final continua recebendo EXIF em sticker.js.
 */
export async function runCwebpSticker(input, output) {
    let tempDir;

    try {
        tempDir = await mkdtemp(
            join(tmpdir(), "chiru-cwebp-")
        );

        const png = join(tempDir, "sticker.png");

        console.log("🧪 Sticker imagem: Vulkan → cwebp -mt");

        await execFileAsync("ffmpeg", [
            "-hide_banner",
            "-loglevel", "error",
            "-y",
            "-init_hw_device", "vulkan=vk",
            "-filter_hw_device", "vk",
            "-i", input,
            "-vf",
            "format=rgba,hwupload,hwdownload,format=rgba," +
            "scale=512:512:force_original_aspect_ratio=increase," +
            "crop=512:512",
            "-frames:v", "1",
            "-an",
            png
        ], EXEC_OPTIONS);

        await removeOutput(output);

        await execFileAsync("cwebp", [
            "-quiet",
            "-preset", "picture",
            "-q", "80",
            "-m", "6",
            "-mt",
            png,
            "-o", output
        ], EXEC_OPTIONS);

        console.log("✅ Sticker codificado com cwebp -mt após Vulkan");

        return output;
    } catch (error) {
        console.warn(
            "⚠️ Vulkan/cwebp -mt falhou; usando pipeline FFmpeg existente"
        );
        debugError(error);
        await removeOutput(output);

        return await runFFmpegSticker(
            input,
            output,
            "image"
        );
    } finally {
        if (tempDir) {
            await rm(tempDir, {
                recursive: true,
                force: true
            }).catch(() => {});
        }
    }
}
