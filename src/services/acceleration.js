import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
let cachePromise = null;

async function run(args, options = {}) {
    const { stdout } = await execFileAsync("ffmpeg", args, {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 20_000,
        ...options
    });
    return stdout || "";
}

async function commandOutput(args) {
    try {
        return await run(args);
    } catch (error) {
        return String(error?.stdout || "");
    }
}

async function testVulkan() {
    try {
        await run([
            "-hide_banner", "-loglevel", "error",
            "-init_hw_device", "vulkan=vk",
            "-filter_hw_device", "vk",
            "-f", "lavfi", "-i", "color=c=red:s=64x64",
            "-vf", "format=rgba,hwupload,scale_vulkan=512:512,hwdownload,format=rgba",
            "-frames:v", "1", "-f", "null", "-"
        ]);
        return true;
    } catch (error) {
        console.warn("⚠️ Pipeline Vulkan real indisponível:", String(error?.stderr || error?.message || "").trim());
        return false;
    }
}

async function detect() {
    const [filtersText, encodersText, decodersText, vulkan] = await Promise.all([
        commandOutput(["-hide_banner", "-filters"]),
        commandOutput(["-hide_banner", "-encoders"]),
        commandOutput(["-hide_banner", "-decoders"]),
        testVulkan()
    ]);

    const decoderNames = new Set(
        [...decodersText.matchAll(/^\s*[VAS.]\S*\s+(\S+_mediacodec)\s/mg)]
            .map(match => match[1])
    );
    const encoderNames = new Set(
        [...encodersText.matchAll(/^\s*[VAS.]\S*\s+(\S+_mediacodec)\s/mg)]
            .map(match => match[1])
    );

    const result = {
        vulkan,
        scaleVulkan: /\bscale_vulkan\b/.test(filtersText),
        mediaCodecDecoders: [...decoderNames],
        mediaCodecEncoders: [...encoderNames],
        webp: /\blibwebp\b/.test(encodersText),
        webpAnimated: /\blibwebp_anim\b/.test(encodersText)
    };

    console.log("🌸 Capacidades FFmpeg verificadas:", JSON.stringify(result));
    return result;
}

export async function detectAcceleration({ refresh = false } = {}) {
    if (refresh) cachePromise = null;
    if (!cachePromise) {
        cachePromise = detect().catch(error => {
            cachePromise = null;
            throw error;
        });
    }
    return cachePromise;
}

export async function resetAccelerationCache() {
    cachePromise = null;
    return detectAcceleration();
}
