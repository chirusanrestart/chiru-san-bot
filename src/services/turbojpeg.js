import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";

const execFileAsync = promisify(execFile);
const helperPath = process.env.TURBOJPEG_HELPER ||
    path.resolve("bin/turbojpeg-ppm");
const CWEBP = process.env.CWEBP_BIN || "cwebp";

async function isExecutable(file) {
    try {
        await access(file);
        return true;
    } catch {
        return false;
    }
}

function isJpeg(buffer) {
    return buffer.length >= 3 &&
        buffer[0] === 0xFF &&
        buffer[1] === 0xD8 &&
        buffer[2] === 0xFF;
}

/**
 * Optional TurboJPEG fast path for still JPEGs.
 * Returns false when unavailable/not applicable so the existing FFmpeg
 * pipeline remains the fallback. Does not touch ffmpeg.js.
 */
export async function tryTurboJpegSticker(input, output, quality = 80) {
    if (!(await isExecutable(helperPath))) return false;

    const header = await readFile(input).then(b => b.subarray(0, 3));
    if (!isJpeg(header)) return false;

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "chiru-turbojpeg-"));
    const ppm = path.join(tempDir, "cropped.ppm");

    try {
        await execFileAsync(helperPath, [input, ppm], {
            timeout: 20000,
            maxBuffer: 2 * 1024 * 1024
        });

        await execFileAsync(CWEBP, [
            "-q", String(Math.max(0, Math.min(100, quality))),
            "-mt",
            "-resize", "512", "512",
            "-metadata", "none",
            "-o", output,
            ppm
        ], {
            timeout: 30000,
            maxBuffer: 2 * 1024 * 1024
        });

        const info = await stat(output);
        if (!info.isFile() || info.size === 0) {
            throw new Error("cwebp produced an empty file");
        }
        return true;
    } catch (error) {
        await rm(output, { force: true }).catch(() => {});
        if (process.env.TURBOJPEG_DEBUG === "1") {
            console.warn("⚠️ TurboJPEG fast path failed; using FFmpeg:", error?.stderr || error?.message || error);
        }
        return false;
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}
