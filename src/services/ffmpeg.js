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



export async function runFFmpegHD(
    input,
    output
) {

    const methods = [];


    if (await testVulkan()) {

        methods.push("vulkan");

    }


    if (await testOpenCL()) {

        methods.push("opencl");

    }


    methods.push("cpu");



    for (const method of methods) {

        try {

            console.log(
                `🧪 HD testando método: ${method}`
            );


            const command =
                buildHDCommand(
                    input,
                    output,
                    method
                );


            await execAsync(command);


            console.log(
                `✅ HD processado usando: ${method}`
            );


            return output;


        } catch (error) {

            console.warn(
                `⚠️ HD ${method} falhou`
            );


            console.log(
                error.stderr || ""
            );

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
        `ffmpeg -y -i "${input}" "${output}"`
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
        `ffmpeg -y ${hwInit} ` +
        `-i "${input}" ` +
        `-vf "${filter}" ` +
        `-q:v 2 ` +
        `-frames:v 1 ` +
        `-an ` +
        `"${output}"`
    ).replace(/\s+/g, " ");

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
            `-init_hw_device opencl=${openclDevice} ` +
            `-filter_hw_device ${openclDevice}`;


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
            ",scale=512:512";

    } else {

        filter +=
            ",scale=512:512";

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
