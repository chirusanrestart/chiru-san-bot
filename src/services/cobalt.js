import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const DOWNLOAD_DIR = path.resolve("downloads");
const MAX_MEDIA_BYTES = 150 * 1024 * 1024;
const REQUEST_INTERVAL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MEDIA_TIMEOUT_MS = 120_000;

let cobaltQueue = Promise.resolve();
let lastRequestStartedAt = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getCobaltConfig() {
  // Instância comunitária listada no Cobalt Directory; pode ser trocada pelo .env.
  const rawUrl = process.env.COBALT_API_URL?.trim() || "https://api-cobalt.eversiege.network/";

  let apiUrl;
  try {
    apiUrl = new URL(rawUrl);
  } catch {
    throw new Error("COBALT_API_URL não é uma URL válida.");
  }

  if (apiUrl.protocol !== "https:" && apiUrl.hostname !== "localhost" && apiUrl.hostname !== "127.0.0.1") {
    throw new Error("A instância Cobalt deve usar HTTPS (exceto localhost).");
  }

  apiUrl.pathname = apiUrl.pathname.endsWith("/") ? apiUrl.pathname : `${apiUrl.pathname}/`;
  apiUrl.search = "";
  apiUrl.hash = "";

  return {
    apiUrl,
    apiKey: process.env.COBALT_API_KEY?.trim()
  };
}

// Uma fila global por processo. As chamadas à API começam com pelo menos
// 10 segundos de intervalo, mesmo quando vários usuários pedem downloads juntos.
function requestCobalt(payload, config) {
  const request = cobaltQueue.then(async () => {
    const waitMs = Math.max(0, lastRequestStartedAt + REQUEST_INTERVAL_MS - Date.now());
    if (waitMs > 0) await sleep(waitMs);

    lastRequestStartedAt = Date.now();

    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "Chiru-san-Bot/1.0"
    };
    if (config.apiKey) headers.authorization = `Api-Key ${config.apiKey}`;

    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`A instância Cobalt retornou JSON inválido (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      const detail = result?.error?.code || result?.message || `HTTP ${response.status}`;
      throw new Error(`Cobalt recusou o pedido: ${detail}`);
    }

    return result;
  });

  cobaltQueue = request.catch(() => {});
  return request;
}

function validateMediaUrl(value) {
  let mediaUrl;
  try {
    mediaUrl = new URL(value);
  } catch {
    throw new Error("Cobalt não retornou uma URL de mídia válida.");
  }

  if (mediaUrl.protocol !== "https:" && mediaUrl.protocol !== "http:") {
    throw new Error("Cobalt retornou um protocolo de mídia inválido.");
  }
  return mediaUrl;
}

export async function downloadCobalt(url, options = {}) {
  const config = getCobaltConfig();
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

  const result = await requestCobalt({
    url,
    videoQuality: String(options.videoQuality || "720"),
    filenameStyle: "basic",
    downloadMode: options.type === "audio" ? "audio" : "auto"
  }, config);

  if (result?.status === "error") {
    const code = result.error?.code || result.error?.message || "erro desconhecido";
    throw new Error(`Cobalt: ${code}`);
  }

  if (result?.status === "picker") {
    throw new Error("Cobalt retornou várias opções de mídia; esse tipo de seleção ainda não é suportado.");
  }

  if (!["tunnel", "redirect"].includes(result?.status) || typeof result.url !== "string") {
    throw new Error("Cobalt não retornou um link de mídia compatível.");
  }

  const mediaUrl = validateMediaUrl(result.url);
  const response = await fetch(mediaUrl, {
    headers: { accept: "video/*,audio/*,application/octet-stream;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS)
  });

  if (!response.ok || !response.body) {
    throw new Error(`Falha ao baixar a mídia fornecida pelo Cobalt (HTTP ${response.status}).`);
  }

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_MEDIA_BYTES) {
    throw new Error("A mídia ultrapassa o limite de 150 MB.");
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const reportedExtension = typeof result.filename === "string"
    ? path.extname(result.filename).slice(1).toLowerCase()
    : "";
  const allowedExtensions = new Set(["mp4", "webm", "m4a", "mp3", "ogg", "opus", "wav", "gif", "jpg", "jpeg", "png", "mkv"]);
  const extension = allowedExtensions.has(reportedExtension) ? reportedExtension
    : contentType.includes("audio/") ? "mp3"
    : contentType.includes("webm") ? "webm"
    : contentType.includes("video/") ? "mp4"
    : "bin";
  const file = path.join(DOWNLOAD_DIR, `cobalt-${randomUUID()}.${extension}`);
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
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(file, { flags: "wx" }));
  } catch (error) {
    await fs.unlink(file).catch(() => {});
    throw error;
  }

  return {
    success: true,
    file,
    title: typeof result.filename === "string" ? result.filename.slice(0, 500) : "Mídia baixada pelo Cobalt",
    description: null,
    thumbnail: null
  };
}
