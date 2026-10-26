import { promises as fs } from "node:fs";
import path from "node:path";

import Downloader from "../../services/downloader.js";
import { getYouTubePlaylist, isMelissaApiConfigured } from "../../services/melissaApi.js";
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

export default {
  name: "playlist",
  description: "Baixa playlist do YouTube em áudio ou vídeo, na ordem original",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const parsed = parseArgs(args);
    const mode = parsed.mode || "audio";
    const url = parsed.url;

    if (!url) {
      await sock.sendMessage(jid, {
        text:
          "📀 *Playlist do YouTube*\n\n" +
          "Escolha o formato e envie o link:\n" +
          "🎵 Áudio: .playlist audio LINK\n" +
          "🎬 Vídeo: .playlist video LINK\n\n" +
          "Também aceita .playlist LINK audio ou .playlist LINK video."
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
        text: "🔎 Lendo a playlist e preparando " + (mode === "audio" ? "os áudios 🎵..." : "os vídeos 🎬..."),
      }, { quoted: msg });

      let playlistTitle = "";
      if (isMelissaApiConfigured()) {
        try {
          const playlist = await getYouTubePlaylist(url);
          tracks = playlist.tracks.slice(0, 40);
          playlistTitle = playlist.title || "";
          console.log(`[PLAYLIST] Lista obtida pela Melissa API: ${tracks.length} faixas.`);
        } catch (apiError) {
          console.warn(`[PLAYLIST] API remota falhou; tentando ler a playlist localmente: ${apiError.message}`);
        }
      }

      // Fallback local caso a API esteja sem chave, indisponível ou retorne erro.
      if (tracks.length === 0) {
        tracks = (await getPlaylistTracks(url)).slice(0, 40);
      }

      await sock.sendMessage(jid, {
        text:
          (playlistTitle ? `📀 *${playlistTitle}*\\n` : `📀 Playlist encontrada: ${tracks.length} itens\\n`) +
          `🎞️ Itens nesta execução: ${tracks.length} (máximo de 40)\\n` +
          `🎧 Formato: ${mode === "audio" ? "áudio" : "vídeo"}\\n\\n` +
          "Vou processar um por vez, mantendo a ordem da playlist."
      }, { quoted: msg });

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        let file = null;
        try {
          await sock.sendMessage(jid, {
            text: `⏳ [${i + 1}/${tracks.length}] ${track.title}\n${mode === "audio" ? "🎵 Preparando áudio..." : "🎬 Preparando vídeo..."}`
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
            await sock.sendMessage(jid, { image: { url: thumbnail }, caption: `${mode === "audio" ? "🎵" : "🎬"} [${i + 1}/${tracks.length}] *${title}*` }, { quoted: msg }).catch(() => {});
          }

          if (mode === "audio") {
            const ext = path.extname(file).toLowerCase();
            const isM4a = String(result.contentType || "").toLowerCase().includes("audio/mp4");
            const mimetype = isM4a || ext === ".m4a" ? "audio/mp4" : ext === ".webm" ? "audio/webm" : ext === ".opus" ? "audio/ogg; codecs=opus" : "audio/mpeg";
            await sock.sendMessage(jid, {
              audio: { url: file },
              mimetype,
              fileName: title + (isM4a ? ".m4a" : (ext || ".mp3")),
              ptt: false
            }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, {
              video: { url: file },
              mimetype: result.contentType?.startsWith("video/") ? result.contentType : "video/mp4",
              caption: `🎬 [${i + 1}/${tracks.length}] ${title}`
            }, { quoted: msg });
          }
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
        text:
          "✅ *Playlist finalizada!*\n\n" +
          `📤 Enviados: ${success}\n` +
          `❌ Falharam: ${failed}\n` +
          `📀 Total processado: ${tracks.length}`
      }, { quoted: msg });
    } catch (error) {
      console.error("[PLAYLIST] Erro:", error);
      await sock.sendMessage(jid, {
        text: `❌ Não consegui processar a playlist.\n${String(error.message || "Erro desconhecido").slice(0, 500)}`
      }, { quoted: msg });
    }
  }
};
