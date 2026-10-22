import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const DOWNLOAD_DIR = path.resolve("downloads");
const MAX_MEDIA_BYTES = 150 * 1024 * 1024;
const EXTRACT_TIMEOUT_MS = 100_000;
const MEDIA_TIMEOUT_MS = 120_000;

function getConfig() {
  const apiUrl = (process.env.MELISSA_DOWNLOADER_API_URL ||
    "https://melissa-downloader-api.onrender.com/extract").trim();
  const apiKey = process.env.MELISSA_DOWNLOADER_API_KEY?.trim() || "";

  let parsedApiUrl;
  try {
    parsedApiUrl = new URL(apiUrl);
  } catch {
    throw new Error("MELISSA_DOWNLOADER_API_URL não é uma URL válida.");
  }

  if (parsedApiUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsedApiUrl.hostname)) {
    throw new Error("A Melissa Downloader API deve usar HTTPS.");
  }

  if (!apiKey) {
    throw new Error("Configure MELISSA_DOWNLOADER_API_KEY no .env.");
  }

  return { apiUrl: parsedApiUrl.toString(), apiKey };
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

  const apiResponse = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "user-agent": "Chiru-san-Bot/1.0"
    },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS)
  });

  let payload;
  try {
    payload = await apiResponse.json();
  } catch {
    throw new Error("Melissa Downloader retornou uma resposta inválida (HTTP " + apiResponse.status + ").");
  }

  if (!apiResponse.ok) {
    const detail = payload?.message || payload?.error || ("HTTP " + apiResponse.status);
    throw new Error("Melissa Downloader: " + detail);
  }

  if (typeof payload?.url !== "string") {
    throw new Error("Melissa Downloader não retornou o link direto da mídia.");
  }

  let mediaUrl;
  try {
    mediaUrl = new URL(payload.url);
  } catch {
    throw new Error("Melissa Downloader retornou um link de mídia inválido.");
  }

  if (!["http:", "https:"].includes(mediaUrl.protocol)) {
    throw new Error("O link de mídia retornado usa um protocolo inválido.");
  }

  // Prefer the headers used by yt-dlp during extraction. Some media hosts
  // reject a bare request even when the extracted URL itself is valid.
  const suppliedHeaders = payload.http_headers && typeof payload.http_headers === "object"
    ? payload.http_headers
    : {};
  const allowedHeaderNames = new Set(["user-agent", "referer", "accept", "accept-language"]);
  const mediaHeaders = new Headers({
    accept: "video/*,audio/*,application/octet-stream;q=0.9,*/*;q=0.8",
    "user-agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36"
  });

  for (const [name, value] of Object.entries(suppliedHeaders)) {
    if (allowedHeaderNames.has(name.toLowerCase()) && typeof value === "string" && value.trim()) {
      mediaHeaders.set(name, value);
    }
  }

  // Use the source page as Referer only if yt-dlp did not provide one.
  if (!mediaHeaders.has("referer")) {
    mediaHeaders.set("referer", new URL(url).href);
  }

  console.log("[API/Melissa] Baixando mídia do host: " + mediaUrl.hostname);
  let mediaResponse;
  try {
    mediaResponse = await fetch(mediaUrl, {
      headers: mediaHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS)
    });
  } catch (error) {
    throw new Error("Falha ao acessar o link direto da mídia (" +
      mediaUrl.hostname + "): " + (error?.cause?.code || error?.name || "erro de rede") + ".");
  }

  const finalHost = (() => {
    try { return new URL(mediaResponse.url || mediaUrl.href).hostname; }
    catch { return mediaUrl.hostname; }
  })();
  const responseType = (mediaResponse.headers.get("content-type") || "").toLowerCase();

  if (!mediaResponse.ok || !mediaResponse.body) {
    console.warn("[API/Melissa] Download recusado: HTTP " + mediaResponse.status + ", host=" + finalHost +
      ", content-type=" + (responseType || "desconhecido"));
    throw new Error("O host da mídia respondeu HTTP " + mediaResponse.status + " (" + finalHost + ").");
  }

  // Prevent an HTML anti-bot/error page from being saved and sent as a video.
  if (responseType.includes("text/html") || responseType.includes("application/json")) {
    console.warn("[API/Melissa] O link direto retornou conteúdo não multimídia: " +
      responseType + ", host=" + finalHost);
    throw new Error("O link extraído retornou uma página de erro, não o arquivo de mídia (" + finalHost + ").");
  }

  const contentType = responseType;
  const declaredSize = Number(mediaResponse.headers.get("content-length") || 0);
  if (declaredSize > MAX_MEDIA_BYTES) {
    throw new Error("A mídia ultrapassa o limite de 150 MB.");
  }

  const extension = extensionFor(payload.ext, contentType);
  const file = path.join(DOWNLOAD_DIR, "melissa-" + randomUUID() + "." + extension);
  let received = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > MAX_MEDIA_BYTES) {
        callback(new Error("A mídia ultrapassa o limite de 150 MB."));
        return;
      }
      callback(null, chunk);
    }
  });

  try {
    await pipeline(
      Readable.fromWeb(mediaResponse.body),
      limiter,
      createWriteStream(file, { flags: "wx" })
    );
  } catch (error) {
    await fs.unlink(file).catch(() => {});
    throw error;
  }

  if (received === 0) {
    await fs.unlink(file).catch(() => {});
    throw new Error("O link extraído retornou um arquivo vazio.");
  }

  const title = typeof payload.title === "string" && payload.title.trim()
    ? payload.title.trim().slice(0, 500)
    : "Vídeo baixado pela Melissa Downloader API";

  console.log("[API/Melissa] Download concluído no aparelho (" + received + " bytes).");

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
