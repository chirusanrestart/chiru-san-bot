import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

let cache = null;


async function run(command) {
    try {
        const { stdout } = await execAsync(command);
        return stdout;
    } catch {
        return "";
    }
}


export async function detectAcceleration() {

    if (cache) return cache;


    const filters = await run(
        "ffmpeg -filters"
    );

    const encoders = await run(
        "ffmpeg -encoders"
    );


    cache = {

        vulkan:
            filters.includes("vulkan") ||
            filters.includes("scale_vulkan"),


        opencl:
            filters.includes("opencl") ||
            filters.includes("scale_opencl"),


        mediacodec:
            encoders.includes("mediacodec")

    };


    console.log("🌸 Aceleração detectada:");
    console.log(cache);


    return cache;

}
