import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);


/**
 * Converte um vídeo ou imagem em sticker testando os métodos em cascata
 * (Vulkan -> OpenCL -> MediaCodec -> CPU)
 */
export async function runFFmpegSticker(
    input,
    output,
    type = "image"
) {

    const methodsQueue = [
        "vulkan",
        "opencl",
        "mediacodec",
        "libwebp"
    ];


    for (const method of methodsQueue) {

        try {

            if (
                type === "image" &&
                method === "mediacodec"
            ) {
                continue;
            }


            console.log(
                `🧪 Testando método: ${method}...`
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
                `✅ Sticker (${type}) gerado usando: ${method}`
            );


            return output;


        } catch (error) {

            console.warn(
                `⚠️ Método ${method} falhou.`
            );

        }

    }


    throw new Error(
        "❌ Todos os métodos de conversão falharam."
    );

}



/**
 * Converte figurinha WEBP em imagem PNG
 */
export async function webpToImage(
    input,
    output
) {

    const command =
        `ffmpeg -y -i "${input}" "${output}"`;


    await execAsync(command);


    return output;

}



/**
 * Monta comandos do FFmpeg
 */
function buildFFmpegCommand(
    input,
    output,
    type,
    method
) {


    if (method === "libwebp") {


        if (type === "video") {

            return `
            ffmpeg -y -i "${input}"
            -t 20
            -vf "fps=10,scale=360:360:force_original_aspect_ratio=decrease,pad=360:360:(ow-iw)/2:(oh-ih)/2"
            -c:v libwebp
            -loop 0
            -quality 75
            -compression_level 6
            -preset picture
            -an "${output}"
            `.replace(/\n/g, " ");


        } else {


            return `
            ffmpeg -y -i "${input}"
            -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2"
            -c:v libwebp
            -quality 80
            -preset picture
            -an "${output}"
            `.replace(/\n/g, " ");

        }

    }



    let hwInit = "";
    let filterChain = "";



    if (type === "video") {


        if (method === "vulkan") {

            hwInit =
                "-init_hw_device vulkan=vk -filter_hw_device vk";

            filterChain =
                "hwupload,fps_vulkan=fps=10,scale_vulkan=360:360,hwdownload,format=yuv420p";


        } else if (method === "opencl") {

            hwInit =
                "-init_hw_device opencl=ocl -filter_hw_device ocl";

            filterChain =
                "hwupload,fps_opencl=fps=10,scale_opencl=360:360,hwdownload,format=yuv420p";


        } else if (method === "mediacodec") {

            filterChain =
                "fps=10,scale=360:360:force_original_aspect_ratio=decrease,pad=360:360:(ow-iw)/2:(oh-ih)/2";

        }


    } else {


        if (method === "vulkan") {

            hwInit =
                "-init_hw_device vulkan=vk -filter_hw_device vk";

            filterChain =
                "hwupload,scale_vulkan=512:512,hwdownload,format=yuv420p";


        } else if (method === "opencl") {

            hwInit =
                "-init_hw_device opencl=ocl -filter_hw_device ocl";

            filterChain =
                "hwupload,scale_opencl=512:512,hwdownload,format=yuv420p";

        }

    }



    const encoder =
        (
            type === "video" &&
            method === "mediacodec"
        )
        ? "h264_mediacodec"
        : "libwebp";



    return `
    ffmpeg -y
    ${hwInit}
    -i "${input}"
    -vf "${filterChain}"
    -c:v ${encoder}
    -quality 80
    -preset picture
    -an "${output}"
    `.replace(/\n/g, " ");


}
