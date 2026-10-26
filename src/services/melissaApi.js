import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const API_BASE_URL = "https://melissa-api-server.hostless.app";
const DEFAULT_TIMEOUT_MS = 240_000;

function config() {
  return {
    baseUrl: API_BASE_URL,
    apiKey: (process.env.MELISSA_API_KEY || "").trim()
  };
}

export function isMelissaApiConfigured() {
  return Boolean(config().apiKey);
}

async function request(path, { body, timeoutMs = 45_000 } = {}) {
  const { baseUrl, apiKey } = config();
  if (!apiKey) {
    const error = new Error("MELISSA_API_KEY não configurada.");
    error.code = "MELISSA_API_NOT_CONFIGURED";
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    const target = new URL(path, baseUrl + "/");
    console.log(`[Melissa API] POST ${target.pathname}`);
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        "accept": "video/mp4, audio/mp4, application/octet-stream, application/json",
        "user-agent": "ChiruSanBot/3.1"
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      // Hostless/proxies may redirect to their canonical hostname.
      redirect: "follow"
    });

    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => {});
      const error = new Error("Melissa API recusou a chave configurada. Confira se MELISSA_API_KEY é igual a API_KEY no servidor.");
      error.code = "MELISSA_API_UNAUTHORIZED";
      throw error;
    }

    if (!response.ok) {
      let detail = "";
      const type = response.headers.get("content-type") || "";
      if (type.includes("application/json")) {
        const data = await response.json().catch(() => ({}));
        detail = data.details || data.error || data.message || "";
      } else {
        detail = (await response.text().catch(() => "")).slice(0, 350);
      }
      const error = new Error("Melissa API HTTP " + response.status + (detail ? ": " + detail : ""));
      error.code = "MELISSA_API_HTTP_ERROR";
      error.status = response.status;
      throw error;
    }

    if (!response.body) throw new Error("Melissa API retornou uma resposta sem conteúdo.");
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Tempo limite consultando a Melissa API.");
      timeoutError.code = "MELISSA_API_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function decodeHeader(response, name) {
  const value = response.headers.get(name);
  if (!value) return null;
  try { return Buffer.from(value, "base64url").toString("utf8").trim() || null; }
  catch { return null; }
}

function responseFilename(response) {
  const disposition = response.headers.get("content-disposition") || "";
  const encodedFilename = disposition.match(/filename\\*=UTF-8''([^;]+)/i);
  const plainFilename = disposition.match(/filename="?([^";]+)"?/i);
  try {
    return encodedFilename ? decodeURIComponent(encodedFilename[1]) : plainFilename?.[1] || null;
  } catch {
    return plainFilename?.[1] || null;
  }
}

async function saveBinaryResponse(response, outputPath, label) {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json") || contentType.includes("text/html")) {
    const detail = (await response.text().catch(() => "")).slice(0, 350);
    throw new Error(`Melissa API devolveu ${contentType || "resposta sem tipo de arquivo"} em vez de mídia${detail ? ": " + detail : ""}`);
  }

  let bytes = 0;
  const source = Readable.fromWeb(response.body);
  source.on("data", chunk => { bytes += chunk.length; });
  await pipeline(source, createWriteStream(outputPath, { flags: "wx" }));
  if (bytes === 0) throw new Error("Melissa API retornou um arquivo vazio.");
  console.log(`[Melissa API] ${label}: ${bytes} bytes recebidos (${contentType || "tipo desconhecido"}).`);
}

export async function searchYouTube(query) {
  if (typeof query !== "string" || !query.trim()) throw new TypeError("Informe o nome para pesquisar no YouTube.");
  const response = await request("/youtube/search", {
    body: { query: query.trim().slice(0, 200) },
    timeoutMs: 60_000
  });
  const data = await response.json();
  if (!data?.result?.url || !data?.result?.title) throw new Error("A Melissa API não encontrou um resultado válido no YouTube.");
  return data.result;
}

export async function getYouTubePlaylist(url) {
  const response = await request("/youtube/playlist", {
    body: { url },
    timeoutMs: 120_000
  });
  const data = await response.json();
  if (!Array.isArray(data?.tracks)) throw new Error("A Melissa API retornou uma playlist inválida.");
  return data;
}

export async function downloadToFile(url, outputPath, { mode = "video" } = {}) {
  const response = await request("/download", {
    body: { url, mode: mode === "audio" ? "audio" : "video", format: mode === "audio" ? "mp3" : "mp4" },
    timeoutMs: DEFAULT_TIMEOUT_MS
  });
  await saveBinaryResponse(response, outputPath, "download concluído");

  return {
    success: true,
    file: outputPath,
    contentType: response.headers.get("content-type") || null,
    title: decodeHeader(response, "x-media-title-b64") || responseFilename(response),
    description: decodeHeader(response, "x-media-description-b64"),
    thumbnail: response.headers.get("x-media-thumbnail-url") || null,
    source: "melissa-api"
  };
}

export async function searchPinterest(query, { min = 1, max = 60 } = {}) {
  if (!query?.trim()) throw new TypeError("A busca do Pinterest está vazia.");
  const safeMax = Math.max(1, Math.min(60, Math.trunc(Number(max) || 60)));
  const safeMin = Math.max(1, Math.min(safeMax, Math.trunc(Number(min) || 1)));
  const response = await request("/pinterest/search", {
    body: { query: query.trim().slice(0, 200), min: safeMin, max: safeMax },
    timeoutMs: 60_000
  });
  const data = await response.json();
  if (!Array.isArray(data?.results)) throw new Error("Resposta inválida da pesquisa Pinterest.");
  return data;
}

export async function downloadPinterestImage(src, outputPath) {
  const response = await request("/pinterest/image", { body: { src }, timeoutMs: 30_000 });
  await saveBinaryResponse(response, outputPath, "imagem Pinterest recebida");
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  return {
    success: true,
    file: outputPath,
    contentType: contentType || null,
    prepared: contentType.includes("image/webp") && response.headers.get("x-sticker-prepared") === "1",
    animated: contentType.includes("image/gif")
  };
}


export async function processStickerPack(items) {
  if (!Array.isArray(items) || !items.length) throw new TypeError("Informe as mídias do pack.");
  const response = await request("/media/process-pack", {
    body: {
      items: items.slice(0, 60).map(item => ({
        src: item.url,
        animated: Boolean(item.animated)
      }))
    },
    timeoutMs: DEFAULT_TIMEOUT_MS
  });
  const data = await response.json();
  if (!data?.ok || !Array.isArray(data.results)) {
    throw new Error("A Melissa API retornou um pack inválido.");
  }
  return data.results;
}


export async function processMedia(kind, media, options = {}) {
  const routes = {
    sticker: "/media/sticker",
    toimg: "/media/toimg",
    hd: "/media/hd"
  };
  const route = routes[kind];
  if (!route) throw new TypeError("Tipo de processamento de mídia desconhecido.");
  const buffer = Buffer.isBuffer(media) ? media : Buffer.from(media);
  if (!buffer.length) throw new TypeError("A mídia está vazia.");
  if (buffer.length > 12 * 1024 * 1024) throw new Error("A mídia excede o limite de 12 MiB para processamento na nuvem.");
  const response = await request(route, {
    body: {
      data: buffer.toString("base64"),
      animated: Boolean(options.animated),
      profile: String(options.profile || "balanced")
    },
    timeoutMs: kind === "sticker" && options.animated ? 120_000 : 60_000
  });
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json") || contentType.includes("text/html")) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error("Melissa API retornou erro em vez de mídia" + (detail ? ": " + detail : ""));
  }
  const result = Buffer.from(await response.arrayBuffer());
  if (!result.length) throw new Error("Melissa API retornou mídia vazia.");
  return { data: result, contentType };
}

export async function checkMelissaApi() {
  const { baseUrl } = config();
  const response = await fetch(new URL("/health", baseUrl), {
    headers: { "user-agent": "ChiruSanBot/3.1" },
    signal: AbortSignal.timeout(10_000),
    redirect: "follow"
  });
  if (!response.ok) throw new Error("Health check da Melissa API falhou: HTTP " + response.status);
  return response.json();
}
