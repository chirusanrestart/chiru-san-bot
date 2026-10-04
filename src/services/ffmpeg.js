import { exec } from "node:child_process";
import { promisify } from "node:util";
import { unlink, stat } from "node:fs/promises";

const execAsync = promisify(exec);

const FFMPEG = "ffmpeg";

let vulkanAvailable = null;
let openclDevice = null;
let mediacodecAvailable = null;

let stickerBackend = null;
let hdBackend = null;

const OPENCL_DEVICES = [
    "ocl",
    "gpu",
    "opencl",
    "cl",
    "0",
    "0.0",
    "default"
];

function normalizeType(type) {
    return type === "video" ? "video" : "image";
}

function shellPath(path) {
    return `"${String(path).replace(/(["\\$\x60])/g, "\\$1")}"`;
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
            `-frames:v 1 ` +
            `-f null -`
        );

        console.log("🟣 Vulkan funcionando");

        vulkanAvailable = true;
    } catch (error) {
        console.log("⚠️ Vulkan indisponível");

        if (process.env.FFMPEG_DEBUG === "1") {
            console.log(error?.stderr || "");
        }

        vulkanAvailable = false;
    }

    return vulkanAvailable;
}

async function testOpenCL() {
    if (openclDevice !== null) {
        return openclDevice;
    }

    for (const name of OPENCL_DEVICES) {
        try {
            await execAsync(
                `${FFMPEG} -hide_banner -loglevel error ` +
                `-init_hw_device opencl=${name} ` +
                `-f lavfi -i color=s=16x16 ` +
                `-frames:v 1 ` +
                `-f null -`
            );

            console.log(
                `🟢 OpenCL funcionando: ${name}`
            );

            openclDevice = name;

            return name;
        } catch {}
    }

    console.log("⚠️ OpenCL indisponível");

    return null;
}

async function testMediaCodec() {
    if (mediacodecAvailable !== null) {
        return mediacodecAvailable;
    }

    try {
        await execAsync(
            `${FFMPEG} -hide_banner -encoders | grep mediacodec`
        );

        console.log("📱 MediaCodec disponível");

        mediacodecAvailable = true;
    } catch {
        console.log("⚠️ MediaCodec indisponível");

        mediacodecAvailable = false;
    }

    return mediacodecAvailable;
}

async function getStickerMethods(type) {
    const methods = [];

    if (await testVulkan()) {
        methods.push("vulkan");
    }

    if (await testOpenCL()) {
        methods.push("opencl");
    }

    if (type === "video" && await testMediaCodec()) {
        methods.push("mediacodec");
    }

    methods.push("cpu");

    return methods;
}

async function getHDMethods() {
    const methods = [];

    if (await testVulkan()) {
        methods.push("vulkan");
    }

    if (await testOpenCL()) {
        methods.push("opencl");
    }

    methods.push("cpu");

    return methods;
}

export async function runFFmpegSticker(
    input,
    output,
    type = "image"
) {
    type = normalizeType(type);

    const methods = await getStickerMethods(type);

    const orderedMethods = [];

    if (stickerBackend && methods.includes(stickerBackend)) {
        orderedMethods.push(stickerBackend);
    }

    for (const method of methods) {
        if (!orderedMethods.includes(method)) {
            orderedMethods.push(method);
        }
    }

    for (const method of orderedMethods) {
        try {
            await removeOutput(output);

            console.log(
                `🧪 FFmpeg Sticker: ${method}`
            );

            const profiles = type === "video"
                ? [
                    { duration: 10, fps: 10, quality: 70 },
                    { duration: 8, fps: 8, quality: 60 },
                    { duration: 6, fps: 6, quality: 50 },
                    { duration: 4, fps: 5, quality: 40 }
                ]
                : [null];

            let lastError = null;

            for (const profile of profiles) {
                try {
                    await removeOutput(output);

                    const command = buildFFmpegCommand(
                        input,
                        output,
                        type,
                        method,
                        profile
                    );

                    if (process.env.FFMPEG_DEBUG === "1") {
                        console.log(`🔧 ${command}`);
                    }

                    await execAsync(command);

                    if (type === "video") {
                        const info = await stat(output);

                        // WhatsApp costuma limitar figurinhas animadas a cerca de 500 KB.
                        if (info.size > 500 * 1024) {
                            console.warn(
                                `⚠️ Figurinha animada grande demais: ${Math.round(info.size / 1024)} KB; tentando comprimir mais`
                            );
                            continue;
                        }
                    }

                    stickerBackend = method;

                    console.log(
                        `✅ Sticker criado usando: ${method}`
                    );

                    return output;
                } catch (error) {
                    lastError = error;
                    if (process.env.FFMPEG_DEBUG === "1") {
                        console.log(
                            error?.stderr ||
                            error?.stdout ||
                            error?.message ||
                            ""
                        );
                    }
                }
            }

            throw lastError || new Error(
                "Não foi possível gerar uma figurinha dentro do limite de tamanho"
            );
        } catch (error) {
            console.warn(
                `⚠️ ${method} falhou`
            );

            if (process.env.FFMPEG_DEBUG === "1") {
                console.log(
                    error?.stderr ||
                    error?.stdout ||
                    error?.message ||
                    ""
                );
            }

            await removeOutput(output);

            if (stickerBackend === method) {
                stickerBackend = null;
            }
        }
    }

    throw new Error(
        "❌ Todos os métodos FFmpeg falharam"
    );
}

export async function runFFmpegHD(
    input,
    output
) {
    const methods = await getHDMethods();

    const orderedMethods = [];

    if (hdBackend && methods.includes(hdBackend)) {
        orderedMethods.push(hdBackend);
    }

    for (const method of methods) {
        if (!orderedMethods.includes(method)) {
            orderedMethods.push(method);
        }
    }

    for (const method of orderedMethods) {
        try {
            await removeOutput(output);

            console.log(
                `🧪 FFmpeg HD: ${method}`
            );

            const command = buildHDCommand(
                input,
                output,
                method
            );

            if (process.env.FFMPEG_DEBUG === "1") {
                console.log(`🔧 ${command}`);
            }

            await execAsync(command);

            hdBackend = method;

            console.log(
                `✅ HD processado usando: ${method}`
            );

            return output;
        } catch (error) {
            console.warn(
                `⚠️ HD ${method} falhou`
            );

            if (process.env.FFMPEG_DEBUG === "1") {
                console.log(
                    error?.stderr ||
                    error?.stdout ||
                    error?.message ||
                    ""
                );
            }

            await removeOutput(output);

            if (hdBackend === method) {
                hdBackend = null;
            }
        }
    }

    throw new Error(
        "❌ Todos os métodos HD falharam"
    );
}

export async function webpToImage(
    input,
    output
) {
    await execAsync(
        `${FFMPEG} -y -i ${shellPath(input)} ${shellPath(output)}`
    );

    return output;
}

function buildHDCommand(
    input,
    output,
    method
) {
    const enhancement =
        "eq=" +
        "contrast=1.45:" +
        "brightness=0.03:" +
        "saturation=1.55";

    let hwInit = "";
    let filter = "";

    if (method === "vulkan") {
        hwInit =
            "-init_hw_device vulkan=vk " +
            "-filter_hw_device vk";

        filter =
            "format=rgba," +
            "hwupload," +
            "hwdownload," +
            "format=rgba," +
            enhancement +
            ",unsharp=5:5:1.0:5:5:0.0";
    }

    else if (method === "opencl") {
        if (!openclDevice) {
            throw new Error(
                "OpenCL não disponível"
            );
        }

        hwInit =
            `-init_hw_device opencl=${openclDevice} ` +
            `-filter_hw_device ${openclDevice}`;

        filter =
            "format=rgba," +
            "hwupload," +
            "unsharp_opencl," +
            "hwdownload," +
            "format=rgba," +
            enhancement;
    }

    else {
        filter =
            enhancement +
            ",unsharp=5:5:1.0:5:5:0.0";
    }

    return (
        `${FFMPEG} -y ${hwInit} ` +
        `-i ${shellPath(input)} ` +
        `-vf "${filter}" ` +
        `-q:v 2 ` +
        `-frames:v 1 ` +
        `-an ` +
        `${shellPath(output)}`
    ).replace(/\s+/g, " ");
}

function buildFFmpegCommand(
    input,
    output,
    type,
    method,
    profile = null
) {
    let hwInit = "";
    let filter = "";

    if (method === "vulkan") {
        hwInit =
            "-init_hw_device vulkan=vk " +
            "-filter_hw_device vk";

        if (type === "video") {
            filter =
                "format=rgba," +
                "hwupload," +
                `fps=${profile?.fps || 10},` +
                "hwdownload," +
                "format=rgba";
        } else {
            filter =
                "format=rgba," +
                "hwupload," +
                "hwdownload," +
                "format=rgba";
        }
    }

    else if (method === "opencl") {
        if (!openclDevice) {
            throw new Error(
                "OpenCL não disponível"
            );
        }

        hwInit =
            `-init_hw_device opencl=${openclDevice} ` +
            `-filter_hw_device ${openclDevice}`;

        filter =
            "format=rgba," +
            "hwupload," +
            "unsharp_opencl," +
            "hwdownload," +
            "format=rgba";
    }

    else if (method === "mediacodec") {
        filter = `fps=${profile?.fps || 10}`;
    }

    else if (method === "cpu") {
        filter = "";
    }

    // Preenche todo o quadro 512x512 sem barras.
    // Mantém a proporção e recorta apenas o excesso.
    if (type === "video" && method !== "vulkan" && method !== "mediacodec") {
        filter += `,fps=${profile?.fps || 10}`;
    }

    filter += ",scale=512:512:force_original_aspect_ratio=increase,crop=512:512";

    return (
        `${FFMPEG} -y ${hwInit} ` +
        `-i ${shellPath(input)} ` +
        `${type === "video" ? `-t ${profile?.duration || 10} ` : ""}` +
        `-vf "${filter}" ` +
        `-c:v libwebp ` +
        `-loop 0 ` +
        `-quality ${profile?.quality || 80} ` +
        `-compression_level 6 ` +
        `-preset picture ` +
        `-an ` +
        `${shellPath(output)}`
    ).replace(/\s+/g, " ");
}

export function getFFmpegAccelerationState() {
    return {
        vulkanAvailable,
        openclDevice,
        mediacodecAvailable,
        stickerBackend,
        hdBackend
    };
}

export function resetFFmpegAccelerationCache() {
    vulkanAvailable = null;
    openclDevice = null;
    mediacodecAvailable = null;

    stickerBackend = null;
    hdBackend = null;

    console.log(
        "♻️ Cache de aceleração FFmpeg resetado"
    );
}
