import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const DOWNLOAD_DIR = path.resolve("downloads");
const API_URL = "https://api.saveapi.org/v1/download";
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

export async function downloadSaveApiInstagram(url) {
  const apiKey = process.env.SAVEAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SAVEAPI_API_KEY não está configurada.");
  }

  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

  const endpoint = new URL(API_URL);
  endpoint.searchParams.set("url", url);

  const apiResponse = await fetch(endpoint, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`
    },
    signal: AbortSignal.timeout(30000)
  });

  let payload;
  try {
    payload = await apiResponse.json();
  } catch {
    throw new Error(`A SaveAPI retornou uma resposta inválida (HTTP ${apiResponse.status}).`);
  }

  if (!apiResponse.ok || payload?.success !== true) {
    const code = payload?.error?.code || payload?.code || `HTTP_${apiResponse.status}`;
    throw new Error(`SaveAPI: ${code}`);
  }

  const mediaList = Array.isArray(payload.medias) ? payload.medias : [];
  const media = mediaList.find(item =>
    item?.type === "video" && typeof item.url === "string" && item.url
  );

  if (!media) {
    throw new Error("A SaveAPI não encontrou um vídeo neste link do Instagram.");
  }

  const mediaUrl = validateMediaUrl(media.url);
  const response = await fetch(mediaUrl, {
    headers: {
      accept: "video/*,application/octet-stream;q=0.9,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36"
    },
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok || !response.body) {
    throw new Error(`Não foi possível baixar o vídeo do Instagram (HTTP ${response.status}).`);
  }

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_VIDEO_BYTES) {
    throw new Error("O vídeo do Instagram ultrapassa o limite de 150 MB.");
  }

  const file = path.join(DOWNLOAD_DIR, `saveapi-instagram-${randomUUID()}.mp4`);
  let received = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > MAX_VIDEO_BYTES) {
        callback(new Error("O vídeo do Instagram ultrapassa o limite de 150 MB."));
        return;
      }
      callback(null, chunk);
    }
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      limiter,
      createWriteStream(file, { flags: "wx" })
    );
  } catch (error) {
    await fs.unlink(file).catch(() => {});
    throw error;
  }

  const meta = payload.meta || {};
  const caption = typeof meta.caption === "string" ? meta.caption.trim() : "";
  const title = typeof meta.title === "string" ? meta.title.trim() : "";
  const author = typeof meta.author === "string"
    ? meta.author
    : meta.author?.username || meta.author?.name || "";

  return {
    success: true,
    file,
    title: (title || caption.split("\n")[0] || "Vídeo do Instagram").slice(0, 500),
    description: [caption, author ? `@${author.replace(/^@/, "")}` : ""].filter(Boolean).join("\n") || null,
    thumbnail: typeof meta.thumbnail === "string" ? meta.thumbnail : (typeof meta.cover === "string" ? meta.cover : null)
  };
}

function validateMediaUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("A SaveAPI retornou uma URL de vídeo inválida.");
  }

  const host = url.hostname.toLowerCase();
  const trustedHost =
    host === "cdninstagram.com" ||
    host.endsWith(".cdninstagram.com") ||
    host === "fbcdn.net" ||
    host.endsWith(".fbcdn.net");

  if (url.protocol !== "https:" || !trustedHost) {
    throw new Error("A SaveAPI retornou um host de vídeo não permitido.");
  }

  return url;
}
