import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const DOWNLOAD_DIR = path.resolve("temp/playlist");

async function ensureDownloadDir() {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
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
    const child = spawn("yt-dlp", args);
    let stdout = "";
    let stderr = "";
    let settled = false;

    const fail = error => {
      if (settled) return;
      settled = true;
      if (error?.code === "ENOENT") {
        const unavailable = new Error("yt-dlp não está instalado; o bot continua funcionando, mas este recurso local de download não está disponível.");
        unavailable.code = "YTDLP_NOT_INSTALLED";
        reject(unavailable);
        return;
      }
      reject(error);
    };

    child.stdout?.on("data", data => { stdout += data.toString(); });
    child.stderr?.on("data", data => { stderr += data.toString(); });
    child.once("error", fail);

    child.once("close", code => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(stderr.trim() || `yt-dlp terminou com código ${code ?? "desconhecido"}`);
        error.code = code;
        reject(error);
      }
    });
  });
}

export async function downloadYoutubeAudioFast(url, name = "audio") {
  await ensureDownloadDir();
  const safeName = `${sanitizeFilename(name) || "audio"}-${randomUUID()}`;
  const outputTemplate = path.join(DOWNLOAD_DIR, `${safeName}.%(ext)s`);

  console.log("[YOUTUBE] 🔎 Baixando áudio...");

  await runYtDlp([
    "--no-playlist",
    "-f", "bestaudio/best",
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "5",
    "-o", outputTemplate,
    url
  ]);

  const files = await fs.readdir(DOWNLOAD_DIR);
  const candidates = files
    .filter(file => file.startsWith(`${safeName}.`))
    .filter(file => !file.endsWith(".part"))
    .filter(file => !file.endsWith(".ytdl"));

  if (candidates.length === 0) {
    throw new Error("yt-dlp terminou, mas o arquivo não foi encontrado.");
  }

  const file = path.join(DOWNLOAD_DIR, candidates[0]);
  console.log(`[YOUTUBE] ✅ Arquivo baixado: ${file}`);
  return file;
}

export async function downloadAudio(url, name = "audio") {
  return downloadYoutubeAudioFast(url, name);
}

export default { downloadAudio, downloadYoutubeAudioFast };
