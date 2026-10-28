import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { downloadTikwm } from "./tikwm.js";
import { downloadToFile, isMelissaApiConfigured } from "./melissaApi.js";

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
    const isInstagram = /(^|\.)(instagram\.com|instagr\.am)$/.test(hostname);

    // Para TikTok em vídeo, prioriza o TikWM e usa a Melissa API como fallback.
    // YouTube, Instagram e TikTok em áudio continuam podendo usar a API primeiro.
    if (isYouTube || isInstagram || (isTikTok && type === "audio")) {
      if (isMelissaApiConfigured()) {
        const extension = type === "audio" ? "m4a" : "mp4";
        const apiOutput = path.join(DOWNLOAD_DIR, `${randomUUID()}-melissa-api.${extension}`);
        try {
          console.log(`[Melissa API] Tentando extração remota de ${hostname}...`);
          const result = await downloadToFile(url, apiOutput, { mode: type });
          console.log("[Melissa API] Download concluído.");
          return {
            ...result,
            title: result.title || path.basename(apiOutput),
            description: result.description || null,
            thumbnail: result.thumbnail || null
          };
        } catch (error) {
          await fs.unlink(apiOutput).catch(() => {});
          console.warn(`[Melissa API] Falhou; ativando fallback local: ${error.message}`);
        }
      }
    }

    // TikTok mantém TikWM como fallback; yt-dlp continua como alternativa final.
    if (type !== "audio" && isTikTok) {
      try {
        console.log("[API/TikWM] Extraindo link do TikTok...");
        return await downloadTikwm(url);
      } catch (error) {
        console.warn(`[Downloader] TikWM falhou; verificando fallback no servidor: ${error.message}`);
      }

      // Fallback remoto: usa o servidor próprio só quando o TikWM falhar.
      if (isMelissaApiConfigured()) {
        const apiOutput = path.join(DOWNLOAD_DIR, `${randomUUID()}-melissa-api.mp4`);
        try {
          console.log("[Melissa API] TikWM falhou; tentando download remoto...");
          const result = await downloadToFile(url, apiOutput, { mode: "video" });
          console.log("[Melissa API] Fallback remoto concluído.");
          return {
            ...result,
            title: result.title || path.basename(apiOutput),
            description: result.description || null,
            thumbnail: result.thumbnail || null
          };
        } catch (apiError) {
          await fs.unlink(apiOutput).catch(() => {});
          console.warn(`[Melissa API] Fallback remoto falhou; tentando yt-dlp local: ${apiError.message}`);
        }
      } else {
        console.warn("[Melissa API] Fallback ignorado: MELISSA_API_KEY não está configurada.");
      }
    }

    console.log(`[LOCAL] Iniciando yt-dlp neste aparelho para ${hostname}...`);
    const output = path.join(DOWNLOAD_DIR, `${randomUUID()}-%(title)s.%(ext)s`);
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
      if (error?.code === "ENOENT") {
        const unavailable = new Error("yt-dlp não está instalado. O bot continua funcionando; este download local não está disponível e a API Melissa pode ser usada quando configurada.");
        unavailable.code = "YTDLP_NOT_INSTALLED";
        reject(unavailable);
        return;
      }
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

      console.log("[LOCAL] yt-dlp concluiu o download no aparelho.");
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

function hasAudioStream(filePath) {
  return new Promise(resolve => {
    const probe = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=codec_type",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    let output = "";
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    probe.stdout.on("data", chunk => { output += chunk.toString(); });
    probe.on("error", () => finish(null));
    probe.on("close", code => {
      if (code !== 0) return finish(null);
      finish(output.trim().split(/\r?\n/).some(line => line.trim() === "audio"));
    });
  });
}
