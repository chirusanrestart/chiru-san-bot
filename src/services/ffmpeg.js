import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink, stat } from "node:fs/promises";
import { detectAcceleration } from "./acceleration.js";

const execFileAsync = promisify(execFile);
const FFMPEG = "ffmpeg";
const FFPROBE = "ffprobe";
const MAX_BUFFER = 16 * 1024 * 1024;

async function run(args, options = {}) {
    return execFileAsync(FFMPEG, args, {
        encoding: "utf8",
        maxBuffer: MAX_BUFFER,
        ...options
    });
}

async function removeOutput(file) {
    if (!file) return;
    try { await unlink(file); } catch {}
}

async function getVideoCodec(input) {
    try {
        const { stdout } = await execFileAsync(FFPROBE, [
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_name",
            "-of", "default=noprint_wrappers=1:nokey=1",
            input
        ], { encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 10_000 });
        return stdout.trim().toLowerCase();
    } catch {
        return "";
    }
}

function mediaCodecDecoderFor(codec, capabilities) {
    const aliases = {
        h264: ["h264_mediacodec"],
        hevc: ["hevc_mediacodec"],
        vp8: ["vp8_mediacodec"],
        vp9: ["vp9_mediacodec"],
        av1: ["av1_mediacodec"],
        mpeg4: ["mpeg4_mediacodec"],
        h263: ["h263_mediacodec"],
        mpeg2video: ["mpeg2_mediacodec"]
    };
    return (aliases[codec] || []).find(name =>
        capabilities.mediaCodecDecoders.includes(name)
    ) || null;
}

function imageScaleFilter(method) {
    if (method === "vulkan") {
        return "format=rgba,hwupload,scale_vulkan=512:512,hwdownload,format=rgba";
    }
    return "scale=512:512";
}

function buildStickerArgs(input, output, type, method, profile, decoder = null) {
    const args = ["-hide_banner", "-loglevel", "error", "-y"];

    if (method === "vulkan") {
        args.push("-init_hw_device", "vulkan=vk", "-filter_hw_device", "vk");
    }

    if (decoder) args.push("-c:v", decoder);
    args.push("-i", input);

    if (type === "video") {
        args.push("-t", String(profile.duration), "-vf",
            `fps=${profile.fps},${imageScaleFilter(method)}`);
        args.push("-an", "-vsync", "0");
        args.push("-c:v", profile.animatedEncoder);
        args.push("-loop", "0", "-quality", String(profile.quality),
            "-compression_level", "6", output);
    } else {
        args.push("-vf", imageScaleFilter(method), "-frames:v", "1", "-an",
            "-c:v", "libwebp", "-quality", String(profile.quality),
            "-compression_level", "6", output);
    }

    return args;
}

function buildHDArgs(input, output, method) {
    const enhancement = "eq=contrast=1.45:brightness=0.03:saturation=1.55,unsharp=5:5:1.0:5:5:0.0";
    const args = ["-hide_banner", "-loglevel", "error", "-y"];

    if (method === "vulkan") {
        args.push("-init_hw_device", "vulkan=vk", "-filter_hw_device", "vk");
    }

    args.push("-i", input, "-vf", `${imageScaleFilter(method)},${enhancement}`,
        "-frames:v", "1", "-an", "-q:v", "2", output);
    return args;
}

function errorText(error) {
    return String(error?.stderr || error?.stdout || error?.message || "erro desconhecido").trim();
}

async function runWithFallback({ input, output, methods, makeArgs, label, validate }) {
    let lastError;

    for (const method of methods) {
        await removeOutput(output);
        try {
            console.log(`🧪 FFmpeg ${label}: ${method}`);
            const args = makeArgs(method);
            if (process.env.FFMPEG_DEBUG === "1") {
                console.log("🔧 ffmpeg", args.map(x => JSON.stringify(x)).join(" "));
            }

            await run(args);
            if (validate) await validate(output, method);

            console.log(`✅ ${label} concluído: ${method}`);
            return output;
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ ${label} falhou com ${method}: ${errorText(error)}`);
            await removeOutput(output);
        }
    }

    throw new Error(`Todos os métodos de ${label} falharam: ${errorText(lastError)}`);
}

export async function runFFmpegSticker(input, output, type = "image", options = {}) {
    type = type === "video" ? "video" : "image";
    const capabilities = await detectAcceleration();
    const methods = [];

    if (type === "image" && capabilities.vulkan && capabilities.scaleVulkan) {
        methods.push("vulkan");
    }
    methods.push("cpu");

    const profiles = type === "video"
        ? [
            { duration: Number(options.duration) || 10, fps: Number(options.fps) || 10, quality: Number(options.quality) || 70 },
            { duration: Math.min(Number(options.duration) || 8, 8), fps: 8, quality: 60 },
            { duration: 6, fps: 6, quality: 50 },
            { duration: 4, fps: 5, quality: 40 }
        ]
        : [{ quality: Number(options.quality) || 80 }];

    let lastError;

    for (const profile of profiles) {
        const animatedEncoder = capabilities.webpAnimated ? "libwebp_anim" : "libwebp";
        const codec = type === "video" ? await getVideoCodec(input) : "";
        const hwDecoder = type === "video" ? mediaCodecDecoderFor(codec, capabilities) : null;
        const decodeAttempts = type === "video"
            ? [...(hwDecoder ? [hwDecoder] : []), null]
            : [null];

        for (const decoder of decodeAttempts) {
            const methodsForAttempt = type === "image" ? methods : ["cpu"];
            try {
                return await runWithFallback({
                    input,
                    output,
                    methods: methodsForAttempt,
                    label: type === "video" ? `Sticker vídeo${decoder ? " (MediaCodec decode)" : ""}` : "Sticker imagem",
                    makeArgs: method => buildStickerArgs(input, output, type, method,
                        { ...profile, animatedEncoder }, decoder),
                    validate: async file => {
                        const info = await stat(file);
                        if (!info.size) throw new Error("FFmpeg gerou arquivo vazio");
                        if (type === "video" && info.size > 500 * 1024) {
                            throw new Error(`WebP animado excede 500 KB (${Math.round(info.size / 1024)} KB)`);
                        }
                    }
                });
            } catch (error) {
                lastError = error;
                if (!decoder) break;
                console.warn("⚠️ Decoder MediaCodec falhou; tentando decodificação por CPU:", errorText(error));
            }
        }
    }

    throw lastError || new Error("Não foi possível gerar a figurinha");
}

export async function runFFmpegHD(input, output) {
    const capabilities = await detectAcceleration();
    const methods = capabilities.vulkan && capabilities.scaleVulkan
        ? ["vulkan", "cpu"]
        : ["cpu"];

    return runWithFallback({
        input,
        output,
        methods,
        label: "HD imagem",
        makeArgs: method => buildHDArgs(input, output, method),
        validate: async file => {
            const info = await stat(file);
            if (!info.size) throw new Error("Arquivo HD vazio");
        }
    });
}

export async function webpToImage(input, output) {
    await run(["-y", "-i", input, output]);
    return output;
}

export async function getFFmpegAccelerationState() {
    return detectAcceleration();
}

export async function resetFFmpegAccelerationCache() {
    const { resetAccelerationCache } = await import("./acceleration.js");
    await resetAccelerationCache();
}
