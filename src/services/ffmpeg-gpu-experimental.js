import { exec } from "node:child_process";
import { promisify } from "node:util";
import { unlink } from "node:fs/promises";

const execCommand = promisify(exec);
const execAsync = (command, options = {}) =>
    execCommand(command, {
        maxBuffer: 16 * 1024 * 1024,
        ...options
    });

const FFMPEG = "ffmpeg";

let vulkanAvailable = null;
let libplaceboAvailable = null;

function shellPath(path) {
    return `"${String(path).replace(/(["\\$\\x60])/g, "\\\\$1")}"`;
}

async function removeOutput(output) {
    if (!output) return;

    try {
        await unlink(output);
    } catch {}
}

async function testVulkan() {
    if (vulkanAvailable !== null) {
        return vulkanAvailable;
    }

    try {
        await execAsync(
            `${FFMPEG} -hide_banner -loglevel error ` +
            `-init_hw_device vulkan=test ` +
            `-f lavfi -i color=s=16x16 ` +
            `-frames:v 1 -f null -`
        );

        console.log("🟣 GPU Experimental: Vulkan funcionando");
        vulkanAvailable = true;
    } catch (error) {
        console.log("⚠️ GPU Experimental: Vulkan indisponível");

        if (process.env.FFMPEG_DEBUG === "1") {
            console.log(error?.stderr || "");
        }

        vulkanAvailable = false;
    }

    return vulkanAvailable;
}

async function testLibplacebo() {
    if (libplaceboAvailable !== null) {
        return libplaceboAvailable;
    }

    try {
        await execAsync(
            `${FFMPEG} -hide_banner -loglevel error ` +
            `-filters | grep -E "\\blibplacebo\\b"`
        );

        console.log("🟢 GPU Experimental: libplacebo disponível");
        libplaceboAvailable = true;
    } catch {
        console.log("⚠️ GPU Experimental: libplacebo indisponível");
        libplaceboAvailable = false;
    }

    return libplaceboAvailable;
}

/**
 * Experimental GPU-only sticker pipeline.
 *
 * A versão antiga fazia:
 *   scale=512:512:force_original_aspect_ratio=increase,crop=512:512
 * no pipeline de CPU depois de eventuais hwdownload.
 *
 * Esta versão usa libplacebo/Vulkan para fazer o resize e o crop
 * proporcional no próprio pipeline GPU:
 *   fit_mode=cover
 *
 * Não existe fallback para crop/scale em CPU nesta versão experimental.
 * Se Vulkan/libplacebo não estiverem disponíveis, o job falha.
 */
function buildGpuStickerCommand(
    input,
    output,
    type = "image",
    profile = null
) {
    const fps = profile?.fps || 10;
    const duration = profile?.duration || 10;
    const quality = profile?.quality || 80;

    const gpuFilter = [
        "format=rgba",
        "hwupload",
        [
            "libplacebo",
            "w=512",
            "h=512",
            "fit_mode=cover",
            "fit_sense=target",
            "reset_sar=1",
            "upscaler=ewa_lanczos",
            "downscaler=ewa_lanczos",
            type === "video" ? `fps=${fps}` : null
        ].filter(Boolean).join(":"),
        "hwdownload",
        "format=rgba"
    ].join(",");

    return (
        `${FFMPEG} -y ` +
        `-init_hw_device vulkan=vk ` +
        `-filter_hw_device vk ` +
        `-i ${shellPath(input)} ` +
        `${type === "video" ? `-t ${duration} ` : ""}` +
        `-vf "${gpuFilter}" ` +
        `-c:v libwebp ` +
        `-loop 0 ` +
        `-quality ${quality} ` +
        `-compression_level 6 ` +
        `-preset picture ` +
        `-an ` +
        `${shellPath(output)}`
    ).replace(/\s+/g, " ");
}

export async function runFFmpegGpuExperimental(
    input,
    output,
    type = "image",
    options = {}
) {
    type = type === "video" ? "video" : "image";

    if (!(await testVulkan())) {
        throw new Error(
            "GPU Experimental: Vulkan não está disponível"
        );
    }

    if (!(await testLibplacebo())) {
        throw new Error(
            "GPU Experimental: libplacebo não está disponível"
        );
    }

    const clamp = (value, fallback, min, max) => {
        const number = Number(value);

        return Number.isFinite(number)
            ? Math.min(max, Math.max(min, Math.round(number)))
            : fallback;
    };

    const profile = type === "video"
        ? {
            duration: clamp(options.duration, 10, 1, 10),
            fps: clamp(options.fps, 10, 1, 30),
            quality: clamp(options.quality, 70, 1, 100)
        }
        : {
            quality: clamp(options.quality, 80, 1, 100)
        };

    await removeOutput(output);

    const command = buildGpuStickerCommand(
        input,
        output,
        type,
        profile
    );

    console.log("🧪 FFmpeg GPU Experimental: Vulkan + libplacebo");

    if (process.env.FFMPEG_DEBUG === "1") {
        console.log(`🔧 ${command}`);
    }

    try {
        await execAsync(command);
    } catch (error) {
        await removeOutput(output);

        if (process.env.FFMPEG_DEBUG === "1") {
            console.log(
                error?.stderr ||
                error?.stdout ||
                error?.message ||
                ""
            );
        }

        throw error;
    }

    console.log(
        "✅ FFmpeg GPU Experimental concluído sem crop/scale em CPU"
    );

    return output;
}

export function getFFmpegGpuExperimentalState() {
    return {
        vulkanAvailable,
        libplaceboAvailable
    };
}

export function resetFFmpegGpuExperimentalCache() {
    vulkanAvailable = null;
    libplaceboAvailable = null;

    console.log(
        "♻️ Cache FFmpeg GPU Experimental resetado"
    );
}
