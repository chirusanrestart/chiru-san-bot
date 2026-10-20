import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { downloadTikwm } from "./tikwm.js";

const DOWNLOAD_DIR = path.resolve("downloads");

await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

export default class Downloader {
  static async download(url, options = {}) {
    const type = options.type || "video";

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error("URL inválida. Envie um link completo com http:// ou https://.");
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Por segurança, o download aceita apenas URLs HTTP ou HTTPS.");
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const isYouTube = /(^|\.)((youtube\.com)|(youtu\.be)|(youtube-nocookie\.com))$/.test(hostname);
    const isTikTok = /(^|\.)((tiktok\.com)|(tiktokv\.com)|(tiktokcdn\.com))$/.test(hostname);

    // Para vídeos do TikTok, tenta primeiro a API TikWM. Se ela falhar, mantém o yt-dlp como fallback.\n    if (type !== "audio" && isTikTok) {\n      try {\n        const result = await downloadTikwm(url);\n        console.log("[Downloader] TikTok baixado pelo TikWM.");\n        return result;\n      } catch (error) {\n        console.warn(`[Downloader] TikWM falhou; tentando yt-dlp: ${error.message}`);\n      }\n    }\n\n    const output = path.join(DOWNLOAD_DIR, `${randomUUID()}-%(title)s.%(ext)s`);
    const args = [
      "--newline",
      "--no-playlist",
      "--user-agent",
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      "--referer",
      isYouTube ? "https://www.youtube.com/" : parsedUrl.origin,
      "--restrict-filenames",
      "--print", "ChiruTitle:%(title)s",
      "--print", "ChiruDescription:%(description)s",
      "--print", "ChiruThumbnail:%(thumbnail)s",
      "--print", "after_move:ChiruFile:%(filepath)s",
      "--merge-output-format", "mp4",
      "-o", output
    ];

    // Pede vídeo HD até 720p com áudio separado quando disponível.
    // Não fixa o player Android do YouTube, que pode restringir os formatos oferecidos.
    if (type !== "audio" && isYouTube) {
      args.push("-f", "bv*[height<=720]+ba/b[height<=720]/best");
    }

    // Só força impersonation se a instalação local do yt-dlp confirmar um alvo Chrome.
    // curl_cffi não tem suporte oficial universal para Android/ARMv7.
    if (type !== "audio" && isTikTok) {
      if (await hasChromeImpersonation()) {
        args.push("--impersonate", "chrome");
        console.log("[Downloader] TikTok: impersonation Chrome ativada.");
      } else {
        console.warn("[Downloader] TikTok: sem alvo de impersonation disponível nesta instalação; tentando sem forçar uma dependência incompatível.");
      }
    }

    if (type === "audio") {
      args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
    }

    // Impede que uma URL iniciada por hífen seja interpretada como opção do yt-dlp.
    args.push("--", url);
    return runDownload(args);
  }
}

function runDownload(args) {
  return new Promise((resolve, reject) => {
    const yt = spawn("yt-dlp", args);
    let outputData = "";
    let errorData = "";
    let settled = false;

    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    yt.stdout.on("data", data => {
      const chunk = data.toString();
      console.log(chunk);
      outputData += chunk;
    });
    yt.stderr.on("data", data => {
      errorData += data.toString();
    });
    yt.on("error", fail);
    yt.on("close", async code => {
      if (settled) return;
      if (code !== 0) {
        fail(new Error(errorData.trim() || "Falha no download."));
        return;
      }

      const lines = outputData.split("\n").map(line => line.trim()).filter(Boolean);
      let title = null;
      let description = null;
      let thumbnail = null;
      let filePath = null;

      for (const line of lines) {
        if (line.startsWith("ChiruTitle:")) title = line.slice("ChiruTitle:".length).trim();
        else if (line.startsWith("ChiruDescription:")) description = line.slice("ChiruDescription:".length).trim();
        else if (line.startsWith("ChiruThumbnail:")) thumbnail = line.slice("ChiruThumbnail:".length).trim();
        else if (line.startsWith("ChiruFile:")) filePath = line.slice("ChiruFile:".length).trim();
      }

      if (!filePath || !(await exists(filePath))) {
        fail(new Error("O yt-dlp não informou um arquivo válido para este download."));
        return;
      }

      settled = true;
      resolve({
        success: true,
        file: filePath,
        title: title || path.basename(filePath),
        description: description || null,
        thumbnail: thumbnail || null
      });
    });
  });
}

function hasChromeImpersonation() {
  return new Promise(resolve => {
    const proc = spawn("yt-dlp", ["--list-impersonate-targets"]);
    let output = "";
    let settled = false;

    proc.stdout.on("data", data => { output += data.toString(); });
    proc.stderr.on("data", data => { output += data.toString(); });
    proc.on("error", () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    });
    proc.on("close", code => {
      if (settled) return;
      settled = true;
      const availableChrome = output.split("\n").some(line =>
        /Chrome(?:-\d+)?\s+.*curl_cffi/i.test(line) &&
        !/unavailable|not available/i.test(line)
      );
      resolve(code === 0 && availableChrome);
    });
  });
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
