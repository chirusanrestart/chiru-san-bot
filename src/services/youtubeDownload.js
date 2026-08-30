import { exec } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";

const execAsync = promisify(exec);

export async function downloadAudio(url) {

    const file =
        `./temp/${randomUUID()}.mp3`;

    await execAsync(
        `yt-dlp ` +
        `--js-runtimes node ` +
        `-x ` +
        `--audio-format mp3 ` +
        `--no-overwrites ` +
        `-o "${file}" ` +
        `"${url}"`
    );

    return file;
}


