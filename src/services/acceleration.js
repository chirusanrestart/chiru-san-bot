import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let detectionPromise = null;

async function runFFmpeg(args, timeout = 15000) {
    return execFileAsync("ffmpeg", args, {
        timeout,
        maxBuffer: 8 * 1024 * 1024
    });
}

/**
 * Detects acceleration by executing a real filter pipeline.
 * Listing a filter/encoder is not proof that the device can actually run it.
 * The lib field is deliberately null until a real test chooses a backend.
 */
export async function detectAcceleration({ force = false } = {}) {
    if (detectionPromise && !force) return detectionPromise;

    detectionPromise = (async () => {
        const result = {
            lib: null,
            vulkan: false,
            mediacodec: false
        };

        try {
            await runFFmpeg([
                "-hide_banner",
                "-loglevel", "error",
                "-init_hw_device", "vulkan",
                "-filter_hw_device", "vulkan",
                "-f", "lavfi",
                "-i", "color=c=red:s=64x64",
                "-vf", "format=rgba,hwupload,scale_vulkan=512:512,hwdownload,format=rgba",
                "-frames:v", "1",
                "-f", "null",
                "-"
            ]);

            result.vulkan = true;
            result.lib = "vulkan";
            console.log("🟣 Teste real Vulkan/RGBA/scale_vulkan: OK");
        } catch (error) {
            console.warn("⚠️ Teste real Vulkan falhou; CPU será o fallback.");
            if (process.env.FFMPEG_DEBUG === "1") {
                console.error(String(error?.stderr || error?.message || error));
            }
        }

        // MediaCodec is recorded as a capability only. Its presence in the
        // encoder list alone must never be treated as proof that a particular
        // input codec can be decoded or that WebP output can be encoded on it.
        try {
            const { stdout } = await runFFmpeg(["-hide_banner", "-encoders"]);
            result.mediacodec = /\b\w+_mediacodec\b/.test(stdout);
        } catch {
            result.mediacodec = false;
        }

        if (!result.lib) result.lib = "cpu";

        console.log("🌸 Backend selecionado pelo teste:", result);
        return result;
    })();

    try {
        return await detectionPromise;
    } catch (error) {
        detectionPromise = null;
        throw error;
    }
}

export function resetAccelerationCache() {
    detectionPromise = null;
}
