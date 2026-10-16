import { exec } from "node:child_process";
import { promisify } from "node:util";
import { unlink } from "node:fs/promises";

const execAsync = promisify(exec);
const FFMPEG = "ffmpeg";

let vulkanAvailable = null;
let openclDevice = null;
let preferredBackend = null;

const OPENCL_DEVICES = [
    "ocl", "gpu", "opencl", "cl", "0", "0.0", "default"
];

function shellPath(path) {
    return '"' + String(path).replace(/(["\\$\x60])/g, "\\$1") + '"';
}

async function testVulkan() {
    if (vulkanAvailable !== null) return vulkanAvailable;

    try {
        await execAsync(
            FFMPEG + " -hide_banner -loglevel error " +
            "-init_hw_device vulkan=test -f lavfi -i color=s=16x16 " +
            "-frames:v 1 -f null -"
        );
        vulkanAvailable = true;
        console.log("🟣 HD variants: Vulkan disponível");
    } catch {
        vulkanAvailable = false;
        console.log("⚠️ HD variants: Vulkan indisponível");
    }
    return vulkanAvailable;
}

async function testOpenCL() {
    if (openclDevice !== null) return openclDevice;

    for (const name of OPENCL_DEVICES) {
        try {
            await execAsync(
                FFMPEG + " -hide_banner -loglevel error " +
                "-init_hw_device opencl=" + name +
                " -f lavfi -i color=s=16x16 -frames:v 1 -f null -"
            );
            openclDevice = name;
            console.log("🟢 HD variants: OpenCL disponível (" + name + ")");
            return name;
        } catch {}
    }

    openclDevice = false;
    console.log("⚠️ HD variants: OpenCL indisponível");
    return null;
}

const FILTERS = {
    anime: { eq: "eq=contrast=1.10:brightness=0.005:saturation=1.16", sharp: 0.35 },
    sharp: { eq: "eq=contrast=1.04:saturation=1.02", sharp: 0.72 },
    vivid: { eq: "eq=contrast=1.06:brightness=0.005:saturation=1.24", sharp: 0.25 },
    natural: { eq: "eq=contrast=1.05:brightness=0.005:saturation=1.04", sharp: 0.22 },
    beauty: { eq: "eq=contrast=1.06:brightness=0.012:saturation=1.08,gblur=sigma=0.25", sharp: 0.28 }
};

function buildCommand(input, output, variant, backend) {
    const profile = FILTERS[variant];
    let init = "";
    let filter;

    if (backend === "vulkan") {
        init = "-init_hw_device vulkan=vk -filter_hw_device vk";
        filter = [
            "format=rgba",
            "hwupload",
            "hwdownload",
            "format=rgba",
            profile.eq,
            "unsharp=5:5:" + profile.sharp + ":5:5:0"
        ].join(",");
    } else if (backend === "opencl") {
        if (!openclDevice || openclDevice === false) {
            throw new Error("OpenCL não disponível");
        }
        init = "-init_hw_device opencl=" + openclDevice +
            " -filter_hw_device " + openclDevice;
        filter = [
            "format=rgba",
            "hwupload",
            "unsharp_opencl",
            "hwdownload",
            "format=rgba",
            profile.eq
        ].join(",");
    } else {
        throw new Error("Backend GPU desconhecido");
    }

    return FFMPEG + " -y " + init + " -i " + shellPath(input) +
        ' -vf "' + filter + '" -frames:v 1 -q:v 2 -an ' + shellPath(output);
}

export async function runFFmpegHDVariant(input, output, variant) {
    if (!FILTERS[variant]) throw new Error("Variante HD desconhecida: " + variant);

    const methods = [];
    if (await testVulkan()) methods.push("vulkan");
    if (await testOpenCL()) methods.push("opencl");

    const ordered = [];
    if (preferredBackend && methods.includes(preferredBackend)) ordered.push(preferredBackend);
    for (const method of methods) {
        if (!ordered.includes(method)) ordered.push(method);
    }

    if (!ordered.length) {
        throw new Error("Nenhuma GPU compatível com Vulkan/OpenCL disponível para HD. CPU fallback está desativado.");
    }

    let lastError;
    for (const backend of ordered) {
        try {
            try { await unlink(output); } catch {}
            console.log("🧪 FFmpeg HD variant: " + backend + " / " + variant);
            const command = buildCommand(input, output, variant, backend);
            if (process.env.FFMPEG_DEBUG === "1") console.log("🔧 " + command);
            await execAsync(command, { maxBuffer: 16 * 1024 * 1024 });
            preferredBackend = backend;
            console.log("✅ HD variant processado usando GPU: " + backend);
            return output;
        } catch (error) {
            lastError = error;
            console.warn("⚠️ HD variant falhou usando " + backend);
            if (process.env.FFMPEG_DEBUG === "1") {
                console.log(error?.stderr || error?.stdout || error?.message || "");
            }
            try { await unlink(output); } catch {}
            if (preferredBackend === backend) preferredBackend = null;
        }
    }

    throw lastError || new Error("Todos os backends GPU falharam ao processar a variante HD.");
}
