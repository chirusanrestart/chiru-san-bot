import { promises as fs, createWriteStream } from "node:fs";
import path from "node:path";
import yauzl from "yauzl";
import { pipeline } from "node:stream/promises";

import Downloader from "../../services/downloader.js";
import { downloadYouTubePlaylistToFile, getYouTubePlaylist, isMelissaApiConfigured } from "../../services/melissaApi.js";
import { getPlaylistTracks } from "../../services/youtubePlaylist.js";

function parseArgs(args) {
  const first = String(args[0] || "").toLowerCase();
  const last = String(args.at(-1) || "").toLowerCase();
  if (["audio", "mp3"].includes(first)) return { mode: "audio", url: args.slice(1).join(" ").trim() };
  if (["video", "mp4"].includes(first)) return { mode: "video", url: args.slice(1).join(" ").trim() };
  if (["audio", "mp3"].includes(last)) return { mode: "audio", url: args.slice(0, -1).join(" ").trim() };
  if (["video", "mp4"].includes(last)) return { mode: "video", url: args.slice(0, -1).join(" ").trim() };
  return { mode: null, url: args.join(" ").trim() };
}


function resolveTrackUrl(track) {
  if (!track || typeof track !== "object") return null;

  const candidates = [
    track.url,
    track.webpage_url,
    track.webpageUrl,
    track.video_url,
    track.videoUrl,
    track.link
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    try {
      const parsed = new URL(candidate.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) continue;
      const host = parsed.hostname.toLowerCase();
      if (["youtube.com", "www.youtube.com", "music.youtube.com", "m.youtube.com"].includes(host)) {
        const id = parsed.searchParams.get("v");
        if (id) return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
        if (parsed.searchParams.has("list")) continue;
      }
      if (["youtu.be", "www.youtu.be"].includes(host)) {
        const id = parsed.pathname.split("/").filter(Boolean)[0];
        if (id) return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
      }
      return parsed.toString();
    } catch {}
  }

  const id = track.id || track.videoId || track.video_id;
  if (typeof id === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  }
  return null;
}

function safeName(value) {
  return String(value || "media").replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/\s+/g, " ").trim().slice(0, 150) || "media";
}

async function extractZipEntriesToFiles(zipPath, workDir) {
  return new Promise((resolve, reject) => {
    const extracted = [];
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (openError, zipfile) => {
      if (openError) return reject(openError);
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        try { zipfile.close(); } catch {}
        reject(error);
      };
      zipfile.on("error", fail);
      zipfile.on("end", () => {
        if (settled) return;
        settled = true;
        extracted.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
        resolve(extracted);
      });
      zipfile.on("entry", entry => {
        if (entry.fileName.endsWith("/")) {
          zipfile.readEntry();
          return;
        }
        const name = path.basename(entry.fileName);
        if (!name || name !== entry.fileName || !/\.m4a$/i.test(name)) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (streamError, readStream) => {
          if (streamError) return fail(streamError);
          const file = path.join(workDir, name);
          pipeline(readStream, createWriteStream(file, { flags: "wx" }))
            .then(() => {
              extracted.push({ name, file });
              zipfile.readEntry();
            })
            .catch(fail);
        });
      });
      zipfile.readEntry();
    });
  });
}

export default {
  name: "playlist3",
  description: "Baixa playlist do YouTube em áudio com capa, na ordem original",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const parsed = parseArgs(args);
    const mode = "audio";
    const url = parsed.url;

    if (!url) {
      await sock.sendMessage(jid, {
        text: "📀 *Playlist do YouTube*\n\nEnvie o link da playlist:\n🎵 Áudio: .playlist3 LINK"
      }, { quoted: msg });
      return;
    }

    let parsedUrl;
    try { parsedUrl = new URL(url); } catch {}
    const allowedHosts = new Set([
      "youtube.com", "www.youtube.com", "music.youtube.com",
      "m.youtube.com", "youtu.be"
    ]);
    if (
      !parsedUrl ||
      !["http:", "https:"].includes(parsedUrl.protocol) ||
      !allowedHosts.has(parsedUrl.hostname.toLowerCase()) ||
      !parsedUrl.searchParams.has("list")
    ) {
      await sock.sendMessage(jid, { text: "❌ Envie um link válido de playlist do YouTube." }, { quoted: msg });
      return;
    }

    let success = 0;
    let failed = 0;
    let tracks = [];

    try {
      await sock.sendMessage(jid, {
        text: "🔎 Lendo a playlist e preparando os áudios 🎵..."
      }, { quoted: msg });

      if (isMelissaApiConfigured()) {
        const playlist = await getYouTubePlaylist(url);
        tracks = playlist.tracks;
        await sock.sendMessage(jid, {
          text: `📀 *${playlist.title}*\n🎞️ Itens na fila: ${tracks.length}${playlist.limited ? " (limite atual: 100 itens)" : ""}\n🎧 Formato: áudio\n\nVou processar um por vez, mantendo a ordem da playlist.`
        }, { quoted: msg });
      } else {
        tracks = await getPlaylistTracks(url);
        await sock.sendMessage(jid, {
          text: `📀 Playlist encontrada: ${tracks.length} itens.\n🎧 Formato: áudio\n\nProcessando um por vez...`
        }, { quoted: msg });
      }

      if (isMelissaApiConfigured()) {
        const workDir = path.resolve("downloads", "playlist-" + Date.now());
        await fs.mkdir(workDir, { recursive: true });
        const zipPath = path.join(workDir, "playlist.zip");
        try {
          await sock.sendMessage(jid, { text: "☁️ O servidor vai baixar e converter a playlist inteira. Depois envio as faixas na ordem original..." }, { quoted: msg });
          await downloadYouTubePlaylistToFile(url, zipPath);
          const entries = await extractZipEntriesToFiles(zipPath, workDir);
          if (!entries.length) throw new Error("O servidor devolveu um ZIP sem faixas.");
          for (let i = 0; i < entries.length; i++) {
            const { name, file } = entries[i];
            try {
              const title = name.replace(/^\\d+\\s*-\\s*/, "").replace(/\\.m4a$/i, "");
              await sock.sendMessage(jid, { text: `📤 [${i + 1}/${entries.length}] Enviando: ${title}` });
              await sock.sendMessage(jid, { audio: { url: file }, mimetype: "audio/mp4", fileName: name, ptt: false }, { quoted: msg });
              success++;
            } catch (error) {
              failed++;
              console.error("[PLAYLIST] Falha enviando faixa:", error.message);
            } finally {
              await fs.unlink(file).catch(() => {});
            }
          }
          await sock.sendMessage(jid, { text: "✅ *Playlist finalizada!*\\n\\n" + `☁️ Processada na nuvem\\n📤 Enviados: ${success}\\n❌ Falharam: ${failed}\\n📀 Total: ${entries.length}` }, { quoted: msg });
          return;
        } finally {
          await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
        }
      }

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        let file = null;
        try {
          await sock.sendMessage(jid, {
            text: `⏳ [${i + 1}/${tracks.length}] ${track.title}\n🎵 Preparando áudio...`
          });
          const trackUrl = resolveTrackUrl(track);
          if (!trackUrl) {
            throw new Error("A API retornou uma faixa sem link válido (campos url/id/videoId ausentes).");
          }
          const result = await Downloader.download(trackUrl, { type: mode });
          file = result.file;
          if (!file) throw new Error("O servidor não retornou um arquivo.");

          const title = safeName(result.title || track.title);
          const thumbnail = result.thumbnail || track.thumbnail || track.image || null;
          if (thumbnail) {
            await sock.sendMessage(jid, {
              image: { url: thumbnail },
              caption: `🎵 [${i + 1}/${tracks.length}] *${title}*`
            }, { quoted: msg }).catch(error => {
              console.warn("[PLAYLIST] Não consegui enviar a capa:", error.message);
            });
          }

          const ext = path.extname(file).toLowerCase();
          const isM4a = String(result.contentType || "").toLowerCase().includes("audio/mp4");
          const mimetype = isM4a || ext === ".m4a" ? "audio/mp4" : ext === ".webm" ? "audio/webm" : ext === ".opus" ? "audio/ogg; codecs=opus" : "audio/mpeg";
          await sock.sendMessage(jid, {
            audio: { url: file },
            mimetype,
            fileName: title + (isM4a ? ".m4a" : (ext || ".mp3")),
            ptt: false
          }, { quoted: msg });
          success++;
          console.log(`[PLAYLIST] OK ${i + 1}/${tracks.length}: ${title}`);
        } catch (error) {
          failed++;
          console.error(`[PLAYLIST] Falha ${i + 1}/${tracks.length}:`, error.message);
          await sock.sendMessage(jid, {
            text: `⚠️ Não consegui processar o item ${i + 1}/${tracks.length}: ${track.title}\nVou continuar com o próximo.`
          }, { quoted: msg });
        } finally {
          if (file) await fs.unlink(file).catch(() => {});
        }
      }

      await sock.sendMessage(jid, {
        text: "✅ *Playlist finalizada!*\n\n" +
          `📤 Enviados: ${success}\n❌ Falharam: ${failed}\n📀 Total processado: ${tracks.length}`
      }, { quoted: msg });
    } catch (error) {
      console.error("[PLAYLIST] Erro:", error);
      await sock.sendMessage(jid, {
        text: `❌ Não consegui processar a playlist.\n${String(error.message || "Erro desconhecido").slice(0, 500)}`
      }, { quoted: msg });
    }
  }
};
