import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

let vulkanAvailable = null;
let openclDevice = null;
let mediacodecAvailable = null;


async function testVulkan() {

    if (vulkanAvailable !== null)
        return vulkanAvailable;


    try {

        await execAsync(
            `ffmpeg -hide_banner -loglevel error \
            -init_hw_device vulkan=test \
            -f lavfi -i color=s=16x16 \
            -frames:v 1 \
            -f null -`
        );


        console.log("🟣 Vulkan funcionando");

        vulkanAvailable = true;


    } catch {

        console.log("⚠️ Vulkan indisponível");

        vulkanAvailable = false;

    }


    return vulkanAvailable;
}



async function testOpenCL() {

    if (openclDevice !== null)
        return openclDevice;


    const names = [
        "ocl",
        "gpu",
        "opencl",
        "cl",
        "0",
        "0.0",
        "default"
    ];


    for (const name of names) {

        try {

            await execAsync(
                `ffmpeg -hide_banner -loglevel error \
                -init_hw_device opencl=${name} \
                -f lavfi -i color=s=16x16 \
                -frames:v 1 \
                -f null -`
            );


            console.log(
                `🟢 OpenCL funcionando: ${name}`
            );


            openclDevice = name;

            return name;


        } catch {}

    }


    console.log(
        "⚠️ OpenCL indisponível"
    );


    return null;
}



async function testMediaCodec() {

    if (mediacodecAvailable !== null)
        return mediacodecAvailable;


    try {

        await execAsync(
            `ffmpeg -hide_banner -encoders | grep mediacodec`
        );


        console.log(
            "📱 MediaCodec disponível"
        );


        mediacodecAvailable = true;


    } catch {

        mediacodecAvailable = false;

    }


    return mediacodecAvailable;
}
export async function runFFmpegSticker(
    input,
    output,
    type = "image"
) {

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



    for (const method of methods) {

        try {

            console.log(
                `🧪 Testando método: ${method}`
            );


            const command =
                buildFFmpegCommand(
                    input,
                    output,
                    type,
                    method
                );


            await execAsync(command);


            console.log(
                `✅ Sticker criado usando: ${method}`
            );


            return output;


        } catch (error) {


            console.warn(
                `⚠️ ${method} falhou`
            );


            console.log(
                error.stderr || ""
            );

        }

    }


    throw new Error(
        "❌ Todos os métodos FFmpeg falharam"
    );

}



export async function webpToImage(
    input,
    output
) {

    await execAsync(
        `ffmpeg -y -i "${input}" "${output}"`
    );


    return output;
}
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
        "-init_hw_device vulkan=vk -filter_hw_device vk";


        if (type === "video") {

            filter =
            "format=rgba,hwupload,fps=10,hwdownload,format=rgba";

        } else {

            filter =
            "format=rgba,hwupload,hwdownload,format=rgba";

        }

    }



    else if (method === "opencl") {


        if (!openclDevice) {

            throw new Error(
                "OpenCL não disponível"
            );

        }


        hwInit =
        `-init_hw_device opencl=${openclDevice} -filter_hw_device ${openclDevice}`;


        if (type === "video") {

            filter =
            "format=rgba,hwupload,unsharp_opencl,hwdownload,format=rgba";

        } else {

            filter =
            "format=rgba,hwupload,unsharp_opencl,hwdownload,format=rgba";

        }

    }



    else if (method === "mediacodec") {


        filter =
        "fps=10";

    }



    else if (method === "cpu") {


        filter =
        "";

    }



    if (type === "video") {


        filter +=
        ",scale=360:360:force_original_aspect_ratio=decrease,pad=360:360:(ow-iw)/2:(oh-ih)/2";


    } else {


        filter +=
        ",scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2";

    }



    return (
        `ffmpeg -y ${hwInit} -i "${input}" ` +
        `${type === "video" ? "-t 20 " : ""}` +
        `-vf "${filter}" ` +
        `-c:v libwebp ` +
        `-loop 0 ` +
        `-quality 80 ` +
        `-compression_level 6 ` +
        `-preset picture ` +
        `-an "${output}"`
    ).replace(/\s+/g, " ");

}
