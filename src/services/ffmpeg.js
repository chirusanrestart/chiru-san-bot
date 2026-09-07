import { exec } from "node:child_process";
import { promisify } from "node:util";
import { unlink } from "node:fs/promises";

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
    return `"${String(path).replace(/(["\\$`])/g, "\\$1")}"`;
}

async function removeOutput(output) {
    if (!output) return;

    try {
        await unlink(output);
    } catch {}
}

/* =========================================================
 * VULKAN
 * ========================================================= */

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

/* =========================================================
 * OPENCL
 * ========================================================= */

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

/* =========================================================
 * MEDIACODEC
 * ========================================================= */

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

/* =========================================================
 * BACKEND DISCOVERY
 * ========================================================= */

async function getStickerMethods(type) {
    const methods = [];

    /*
     * Vulkan continua sendo PRIMEIRO.
     *
     * Não mudamos isso porque é justamente o caminho
     * que está comprovadamente funcionando no aparelho.
     */
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

/* =========================================================
 * STICKER
 * ========================================================= */

export async function runFFmpegSticker(
    input,
    output,
    type = "image"
) {
    type = normalizeType(type);

    const methods = await getStickerMethods(type);

    /*
     * Se já sabemos qual backend funcionou antes,
     * tentamos ele primeiro.
     */
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

            const command = buildFFmpegCommand(
                input,
                output,
                type,
                method
            );

            if (process.env.FFMPEG_DEBUG === "1") {
                console.log(`🔧 ${command}`);
            }

            await execAsync(command);

            stickerBackend = method;

            console.log(
                `✅ Sticker criado usando: ${method}`
            );

            return output;
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

            /*
             * Se o backend que estava em cache falhou,
             * removemos ele do cache para a próxima execução.
             */
            if (stickerBackend === method) {
                stickerBackend = null;
            }
        }
    }

    throw new Error(
        "❌ Todos os métodos FFmpeg falharam"
    );
}

/* =========================================================
 * HD IMAGE
 * ========================================================= */

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

/* =========================================================
 * WEBP → IMAGE
 * ========================================================= */

export async function webpToImage(
    input,
    output
) {
    await execAsync(
        `${FFMPEG} -y -i ${shellPath(input)} ${shellPath(output)}`
    );

    return output;
}

/* =========================================================
 * HD COMMAND
 * ========================================================= */

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

        /*
         * Mantido exatamente no modelo funcional
         * do projeto atual.
         *
         * O hwupload/hwdownload é importante aqui.
         */
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

/* =========================================================
 * STICKER COMMAND
 * ========================================================= */

function buildFFmpegCommand(
    input,
    output,
    type,
    method
) {
    let hwInit = "";
    let filter = "";

    if (method === "vulkan") {
        hwInit =
            "-init_hw_device vulkan=vk " +
            "-filter_hw_device vk";

        if (type === "video") {
            /*
             * Mantido do código funcional.
             *
             * O fps acontece entre hwupload/hwdownload,
             * mantendo o pipeline de hardware.
             */
            filter =
                "format=rgba," +
                "hwupload," +
                "fps=10," +
                "hwdownload," +
                "format=rgba";
        } else {
            /*
             * CAMINHO PRINCIPAL DAS FIGURINHAS.
             *
             * Não mexer nesse fluxo sem testar:
             *
             * CPU → RGBA → GPU → GPU → CPU → WebP
             */
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
        filter =
            "fps=10";
    }

    else if (method === "cpu") {
        filter = "";
    }

    /*
     * Escala final continua sendo feita depois
     * do processamento de hardware.
     */
    filter += ",scale=512:512";

    return (
        `${FFMPEG} -y ${hwInit} ` +
        `-i ${shellPath(input)} ` +
        `${type === "video" ? "-t 20 " : ""}` +
        `-vf "${filter}" ` +
        `-c:v libwebp ` +
        `-loop 0 ` +
        `-quality 80 ` +
        `-compression_level 6 ` +
        `-preset picture ` +
        `-an ` +
        `${shellPath(output)}`
    ).replace(/\s+/g, " ");
}

/* =========================================================
 * OPTIONAL DIAGNOSTICS
 * ========================================================= */

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
