import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const API_BASE_URL = "https://melissa-api-server.hostless.app";
const DEFAULT_TIMEOUT_MS = 180_000;

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
    const response = await fetch(new URL(path, baseUrl + "/"), {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        "user-agent": "ChiruSanBot/3.0"
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "error"
    });

    if (response.status === 401 || response.status === 403) {
      const error = new Error("Melissa API recusou a chave configurada.");
      error.code = "MELISSA_API_UNAUTHORIZED";
      throw error;
    }

    if (!response.ok) {
      let detail = "";
      const type = response.headers.get("content-type") || "";
      if (type.includes("application/json")) {
        const data = await response.json().catch(() => ({}));
        detail = data.error || data.message || "";
      } else {
        detail = (await response.text().catch(() => "")).slice(0, 250);
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

export async function downloadToFile(url, outputPath, { mode = "video" } = {}) {
  const response = await request("/download", {
    body: { url, mode: mode === "audio" ? "audio" : "video", format: mode === "audio" ? "mp3" : "mp4" },
    timeoutMs: DEFAULT_TIMEOUT_MS
  });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath, { flags: "wx" }));
  return {
    success: true,
    file: outputPath,
    contentType: response.headers.get("content-type") || null,
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
  await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath, { flags: "wx" }));
  return { success: true, file: outputPath, contentType: response.headers.get("content-type") || null };
}

export async function checkMelissaApi() {
  const { baseUrl } = config();
  const response = await fetch(new URL("/health", baseUrl), {
    headers: { "user-agent": "ChiruSanBot/3.0" },
    signal: AbortSignal.timeout(10_000),
    redirect: "error"
  });
  if (!response.ok) throw new Error("Health check da Melissa API falhou: HTTP " + response.status);
  return response.json();
}
