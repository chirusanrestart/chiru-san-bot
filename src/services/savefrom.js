import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import vm from "node:vm";

const DOWNLOAD_DIR = path.resolve("downloads");
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const WORKER_URL = "https://worker.savefrom.net/savefrom.php";

export async function downloadSaveFrom(url) {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

  const form = new URLSearchParams({
    sf_url: url,
    sf_submit: "",
    new: "2",
    lang: "pt",
    app: "",
    country: "br",
    os: "Android",
    browser: "Chrome",
    channel: "main",
    "sf-nomad": "1",
    url,
    ts: String(Date.now()),
    _ts: "1720433117117",
    _tsc: "0",
    _x: "1"
  });

  const apiResponse = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://en.savefrom.net",
      referer: "https://en.savefrom.net/",
      "user-agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
      accept: "*/*"
    },
    body: form.toString(),
    signal: AbortSignal.timeout(25000)
  });

  if (!apiResponse.ok) {
    throw new Error(`SaveFrom respondeu HTTP ${apiResponse.status}.`);
  }

  const scriptJS = await apiResponse.text();
  if (!scriptJS.trim()) {
    throw new Error("SaveFrom retornou uma resposta vazia.");
  }

  const location = {
    hostname: "en.savefrom.net",
    host: "en.savefrom.net",
    protocol: "https:",
    origin: "https://en.savefrom.net",
    href: "https://en.savefrom.net/"
  };
  const document = { location, referrer: "https://en.savefrom.net/" };
  const parent = {
    document,
    location,
    sf: {
      videoResult: {
        show() {},
        showRows() {}
      },
      enableElement() {}
    }
  };
  const window = { parent, document, location };
  const context = {
    results: null,
    parent,
    window,
    document,
    location,
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36" },
    self: null,
    frameElement: {},
    atob: b64 => Buffer.from(b64, "base64").toString("utf8"),
    _decodeURIComponent: uri => {
      const decoded = decodeURIComponent(uri);
      if (/showResult|showRows|videoResult/.test(decoded)) {
        context.results = decoded;
        return "true";
      }
      return decoded;
    }
  };
  context.self = context.window;

  try {
    vm.createContext(context);
    new vm.Script(`decodeURIComponent = _decodeURIComponent;\n${scriptJS}`).runInContext(context, {
      timeout: 5000
    });
  } catch (error) {
    throw new Error(`SaveFrom: falha ao interpretar resposta JavaScript (${error.message}).`);
  }

  if (!context.results) {
    throw new Error("SaveFrom não retornou dados reconhecíveis; o endpoint pode ter mudado ou bloqueado a solicitação.");
  }

  let parsed;
  try {
    const raw =
      context.results.split("window.parent.sf.videoResult.show(")?.[1] ||
      context.results.split("window.parent.sf.videoResult.showRows(")?.[1];

    if (!raw) throw new Error("padrão de resultado não encontrado");

    if (context.results.includes("showRows")) {
      const splits = raw.split('],"');
      const lastIndex = splits.findIndex(value => value.includes("window.parent.sf.enableElement"));
      parsed = JSON.parse(splits.slice(0, lastIndex < 0 ? splits.length : lastIndex).join('],"') + "]");
    } else {
      parsed = [JSON.parse(raw.split(");")[0])];
    }
  } catch (error) {
    throw new Error(`SaveFrom: não foi possível interpretar os dados retornados (${error.message}).`);
  }

  const candidates = [];
  const visited = new Set();
  const walk = object => {
    if (!object || typeof object !== "object" || visited.has(object)) return;
    visited.add(object);

    if (Array.isArray(object)) {
      object.forEach(walk);
      return;
    }

    if (typeof object.url === "string" && /^https?:\/\//i.test(object.url)) {
      const looksLikeMedia = /\.(mp4|webm|m4a|mp3)(\?|$)/i.test(object.url) ||
        /video|mp4|download/i.test(String(object.type || object.format || object.ext || ""));
      if (looksLikeMedia) candidates.push(object);
    }
    Object.values(object).forEach(walk);
  };
  walk(parsed);

  // Prioriza explicitamente 720p, em vez de escolher a maior resolução.
  // Se 720p não estiver disponível, escolhe a opção mais próxima abaixo;
  // se só houver opções acima, escolhe a mais próxima acima.
  const getQuality = candidate => {
    const raw = [
      candidate.quality,
      candidate.label,
      candidate.name,
      candidate.format,
      candidate.resolution,
      candidate.text
    ].filter(value => value != null).join(" ");
    const match = raw.match(/(?:^|\D)(\d{3,4})\s*p?(?:\D|$)/i);
    return match ? Number(match[1]) : 0;
  };

  const availableVideos = candidates.filter(candidate => typeof candidate.url === "string");
  const qualityScore = quality => {
    if (quality === 720) return 0;
    if (quality > 0 && quality < 720) return 720 - quality;
    if (quality > 720) return 1000 + quality - 720;
    return 2000;
  };
  const video = availableVideos.sort((a, b) =>
    qualityScore(getQuality(a)) - qualityScore(getQuality(b))
  )[0];

  if (!video?.url) {
    throw new Error("SaveFrom não encontrou um link de vídeo na resposta.");
  }

  let mediaUrl;
  try {
    mediaUrl = new URL(video.url);
  } catch {
    throw new Error("SaveFrom retornou uma URL de mídia inválida.");
  }
  if (!["http:", "https:"].includes(mediaUrl.protocol)) {
    throw new Error("SaveFrom retornou um protocolo de mídia inválido.");
  }

  const response = await fetch(mediaUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
      accept: "video/*,application/octet-stream;q=0.9,*/*;q=0.8"
    },
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok || !response.body) {
    throw new Error(`SaveFrom: falha no download do vídeo (HTTP ${response.status}).`);
  }

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_VIDEO_BYTES) {
    throw new Error("O vídeo ultrapassa o limite de 150 MB.");
  }

  const file = path.join(DOWNLOAD_DIR, `savefrom-${randomUUID()}.mp4`);
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

  const title =
    (typeof video.title === "string" && video.title.trim()) ||
    (typeof parsed?.[0]?.meta?.title === "string" && parsed[0].meta.title.trim()) ||
    "Vídeo (SaveFrom)";

  return {
    success: true,
    file,
    title: title.slice(0, 500),
    description: null,
    thumbnail: typeof video.thumb === "string" ? video.thumb : null
  };
}
