import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const DOWNLOAD_DIR = path.resolve("temp/playlist");

async function ensureDownloadDir() {
  await fs.mkdir(DOWNLOAD_DIR, {
    recursive: true
  });
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const process = spawn("yt-dlp", args);

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", data => {
      stdout += data.toString();
    });

    process.stderr.on("data", data => {
      stderr += data.toString();
    });

    process.on("error", reject);

    process.on("close", code => {
      if (code === 0) {
        resolve({
          stdout,
          stderr
        });
      } else {
        const error = new Error(
          `yt-dlp terminou com código ${code}\n${stderr}`
        );

        error.code = code;
        reject(error);
      }
    });
  });
}

export async function downloadYoutubeAudioFast(
  url,
  name = "audio"
) {
  await ensureDownloadDir();

  const safeName = sanitizeFilename(name);

  const outputTemplate = path.join(
    DOWNLOAD_DIR,
    `${safeName}.%(ext)s`
  );

  console.log("[YOUTUBE] 🔎 Baixando áudio...");

  await runYtDlp([
    "--no-playlist",
    "-f",
    "bestaudio/best",
    "-o",
    outputTemplate,
    url
  ]);

  const files = await fs.readdir(DOWNLOAD_DIR);

  const candidates = files
    .filter(file => file.startsWith(`${safeName}.`))
    .filter(file => !file.endsWith(".part"))
    .filter(file => !file.endsWith(".ytdl"));

  if (candidates.length === 0) {
    throw new Error(
      "yt-dlp terminou, mas o arquivo não foi encontrado."
    );
  }

  const file = path.join(
    DOWNLOAD_DIR,
    candidates[0]
  );

  console.log(
    `[YOUTUBE] ✅ Arquivo baixado: ${file}`
  );

  return file;
}

export async function downloadAudio(
  url,
  name = "audio"
) {
  return downloadYoutubeAudioFast(url, name);
}

export default {
  downloadAudio,
  downloadYoutubeAudioFast
};
