import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const DOWNLOAD_DIR = path.resolve("downloads");
const CHUNK_SIZE = 64 * 1024;
const MAX_MEDIA_BYTES = 1024 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

function getConfig() {
  const configuredUrl = (process.env.MELISSA_DOWNLOADER_API_URL ||
    "https://melissa-api-server.hostless.app/download").trim();
  const apiKey = process.env.MELISSA_DOWNLOADER_API_KEY?.trim() || "";

  let apiUrl;
  try {
    apiUrl = new URL(configuredUrl);
  } catch {
    throw new Error("MELISSA_DOWNLOADER_API_URL não é uma URL válida.");
  }

  if (apiUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(apiUrl.hostname)) {
    throw new Error("A Melissa Downloader API deve usar HTTPS.");
  }
  if (!apiKey) {
    throw new Error("Configure MELISSA_DOWNLOADER_API_KEY no .env.");
  }

  // Compatibilidade com instalações que ainda apontam para o endpoint antigo.
  if (apiUrl.pathname.replace(/\/$/, "") === "/extract") apiUrl.pathname = "/download";
  return { apiUrl: apiUrl.toString(), apiKey };
}

function extensionFor(ext, contentType) {
  const allowed = new Set([
    "mp4", "webm", "mkv", "mov", "m4v", "3gp", "ts", "flv",
    "mp3", "m4a", "aac", "opus", "ogg", "wav", "bin"
  ]);
  const cleanExt = String(ext || "").replace(/^\./, "").toLowerCase();
  if (allowed.has(cleanExt)) return cleanExt;

  const mime = String(contentType || "").toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("audio/")) return "m4a";
  if (mime.includes("video/")) return "mp4";
  return "bin";
}

export async function downloadMelissa(url, options = {}) {
  const config = getConfig();
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

  let response;
  try {
    response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        accept: "video/*,audio/*,application/octet-stream,application/json",
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "user-agent": "Chiru-san-Bot/1.1"
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new Error("Não foi possível conectar à Melissa Downloader API: " +
      (error?.cause?.code || error?.name || "erro de rede") + ".");
  }

  if (!response.ok) {
    let detail = "HTTP " + response.status;
    try {
      const payload = await response.json();
      detail = [payload?.message || payload?.error || detail, payload?.reason].filter(Boolean).join(": ");
    } catch {}
    throw new Error("Melissa Downloader: " + detail);
  }

  if (!response.body) {
    throw new Error("Melissa Downloader não enviou o arquivo.");
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html") || contentType.includes("application/json")) {
    let detail = "resposta inválida";
    try {
      const payload = await response.json();
      detail = payload?.message || payload?.error || detail;
    } catch {}
    throw new Error("Melissa Downloader não retornou mídia: " + detail);
  }

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_MEDIA_BYTES) {
    await response.body.cancel().catch(() => {});
    throw new Error("A mídia ultrapassa o limite de 1 GiB.");
  }

  const extension = extensionFor(response.headers.get("x-media-ext"), contentType);
  const file = path.join(DOWNLOAD_DIR, "melissa-" + randomUUID() + "." + extension);
  const rawTitle = response.headers.get("x-media-title") || "Vídeo baixado pela Melissa Downloader API";
  const title = rawTitle.replace(/[\r\n\0]/g, " ").trim().slice(0, 500) || "Vídeo baixado pela Melissa Downloader API";
  let received = 0;

  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > MAX_MEDIA_BYTES) {
        callback(new Error("A mídia ultrapassa o limite de 1 GiB."));
        return;
      }
      callback(null, chunk);
    }
  });

  try {
    // Recebe o stream e grava continuamente em disco, sem carregar o arquivo inteiro na RAM.
    await pipeline(
      Readable.fromWeb(response.body),
      limiter,
      createWriteStream(file, { flags: "wx" })
    );
  } catch (error) {
    await fs.unlink(file).catch(() => {});
    throw new Error(error?.message?.includes("1 GiB")
      ? error.message
      : "A transmissão da Melissa Downloader foi interrompida: " + (error?.message || "erro de stream") + ".");
  }

  if (received === 0) {
    await fs.unlink(file).catch(() => {});
    throw new Error("A Melissa Downloader enviou um arquivo vazio.");
  }
  if (declaredSize > 0 && received !== declaredSize) {
    await fs.unlink(file).catch(() => {});
    throw new Error("A transmissão foi incompleta: esperados " + declaredSize + " bytes, recebidos " + received + ".");
  }

  console.log("[API/Melissa] Arquivo recebido do servidor em stream (" + received +
    " bytes; blocos do servidor: " + CHUNK_SIZE + " bytes).");

  return {
    success: true,
    file,
    title,
    description: title,
    thumbnail: null,
    contentType
  };
}

export default { downloadMelissa };
