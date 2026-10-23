import { stat, unlink } from "node:fs/promises";
import { getRuntimeProfileSummary } from "./runtimeProfile.js";

let sharpPromise;
let profileLogged = false;

async function loadSharp() {
    if (!profileLogged) {
        console.log(getRuntimeProfileSummary());
        profileLogged = true;
    }
    if (!sharpPromise) {
        sharpPromise = import("sharp")
            .then(module => module.default || module)
            .catch(() => null);
    }
    return sharpPromise;
}

/**
 * Optional fast path for static images.
 * Returns false when Sharp is unavailable or conversion fails, leaving the
 * existing TurboJPEG/FFmpeg paths available as fallbacks.
 */
export async function trySharpSticker(input, output, quality = 80) {
    const sharp = await loadSharp();
    if (!sharp) return false;

    try {
        await sharp(input, { limitInputPixels: 40_000_000 })
            .rotate()
            .resize(512, 512, {
                fit: "cover",
                position: "attention"
            })
            .webp({
                quality: Math.max(1, Math.min(100, Math.round(quality))),
                effort: 3,
                smartSubsample: true
            })
            .toFile(output);

        const info = await stat(output);
        if (!info.isFile() || info.size === 0) {
            throw new Error("Sharp produced an empty file");
        }
        return true;
    } catch (error) {
        await unlink(output).catch(() => {});
        if (process.env.SHARP_STICKER_DEBUG === "1") {
            console.warn("⚠️ Sharp fast path failed; trying next backend:", error?.message || error);
        }
        return false;
    }
}
