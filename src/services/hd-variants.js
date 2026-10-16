import { exec } from "node:child_process";
import { promisify } from "node:util";
import { unlink } from "node:fs/promises";

const execAsync = promisify(exec);
const FFMPEG = "ffmpeg";

function shellPath(path) {
    return '"' + String(path).replace(/["\\$]/g, "\\$&") + '"';
}

const FILTERS = {
    anime: "eq=contrast=1.10:brightness=0.005:saturation=1.16,unsharp=5:5:0.35:5:5:0",
    sharp: "eq=contrast=1.04:saturation=1.02,unsharp=5:5:0.72:5:5:0",
    vivid: "eq=contrast=1.06:brightness=0.005:saturation=1.24,unsharp=5:5:0.25:5:5:0",
    natural: "eq=contrast=1.05:brightness=0.005:saturation=1.04,unsharp=5:5:0.22:5:5:0",
    beauty: "eq=contrast=1.06:brightness=0.012:saturation=1.08,gblur=sigma=0.25,unsharp=5:5:0.28:5:5:0"
};

export async function runFFmpegHDVariant(input, output, variant) {
    const filter = FILTERS[variant];
    if (!filter) throw new Error("Variante HD desconhecida: " + variant);
    try { await unlink(output); } catch {}
    const command = FFMPEG + " -y -i " + shellPath(input) +
        ' -vf "' + filter + '" -frames:v 1 -q:v 2 -an ' + shellPath(output);
    await execAsync(command, { maxBuffer: 16 * 1024 * 1024 });
    return output;
}
