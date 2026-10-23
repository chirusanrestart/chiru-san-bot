import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const DOWNLOAD_DIR = path.resolve("downloads");
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const API_URL = "https://www.tikwm.com/api/";

export async function downloadTikwm(url) {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

  const apiUrl = new URL(API_URL);
  apiUrl.searchParams.set("url", url);
  apiUrl.searchParams.set("hd", "1");

  const apiResponse = await fetch(apiUrl, {
    headers: {
      "accept": "application/json",
      "user-agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
      "referer": "https://www.tikwm.com/"
    },
    signal: AbortSignal.timeout(25000)
  });

  if (!apiResponse.ok) {
    throw new Error(`TikWM respondeu HTTP ${apiResponse.status}.`);
  }

  const payload = await apiResponse.json();
  if (payload?.code !== 0 || !payload?.data) {
    throw new Error(payload?.msg || payload?.message || "A API do TikWM não retornou dados do vídeo.");
  }

  const data = payload.data;
  const rawVideoUrl = data.hdplay || data.play || data.wmplay;
  if (typeof rawVideoUrl !== "string" || !rawVideoUrl) {
    throw new Error("A API do TikWM não forneceu um link de vídeo.");
  }

  const videoUrl = new URL(rawVideoUrl, "https://www.tikwm.com/");
  if (!["http:", "https:"].includes(videoUrl.protocol)) {
    throw new Error("O TikWM retornou um endereço de vídeo inválido.");
  }

  const response = await fetch(videoUrl, {
    headers: { "user-agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36" },
    signal: AbortSignal.timeout(90000)
  });
  if (!response.ok || !response.body) {
    throw new Error(`Não foi possível baixar o vídeo do TikWM (HTTP ${response.status}).`);
  }

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_VIDEO_BYTES) {
    throw new Error("O vídeo ultrapassa o limite de 150 MB.");
  }

  const file = path.join(DOWNLOAD_DIR, `tikwm-${randomUUID()}.mp4`);
  let received = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > MAX_VIDEO_BYTES) {
        callback(new Error("O vídeo ultrapassa o limite de 150 MB."));
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

  const author = data.author?.nickname ? `@ ${data.author.nickname}` : "";
  const title = (typeof data.title === "string" && data.title.trim())
    ? data.title.trim().slice(0, 500)
    : "Vídeo do TikTok";

  return {
    success: true,
    file,
    title,
    description: [title, author].filter(Boolean).join("\n"),
    thumbnail: data.cover || data.origin_cover || null
  };
}
