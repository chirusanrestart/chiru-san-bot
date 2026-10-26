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

function safeName(value) {
  return String(value || "media").replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/\s+/g, " ").trim().slice(0, 150) || "media";
}

export default {
  name: "playlist4",
  description: "Baixa playlist do YouTube em vídeo, na ordem original",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const parsed = parseArgs(args);
    const mode = parsed.mode || "video";
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

      if (isMelissaApiConfigured()) {
        const playlist = await getYouTubePlaylist(url);
        tracks = playlist.tracks;
        await sock.sendMessage(jid, {
          text:
            `📀 *${playlist.title}*\n` +
            `🎞️ Itens na fila: ${tracks.length}${playlist.limited ? " (limite atual: 100 itens)" : ""}\n` +
            `🎧 Formato: ${mode === "audio" ? "áudio" : "vídeo"}\n\n` +
            "Vou processar um por vez, mantendo a ordem da playlist."
        }, { quoted: msg });
      } else {
        tracks = await getPlaylistTracks(url);
        await sock.sendMessage(jid, {
          text: `📀 Playlist encontrada: ${tracks.length} itens.\n🎧 Formato: ${mode === "audio" ? "áudio" : "vídeo"}\n\nProcessando um por vez...`
        }, { quoted: msg });
      }

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        let file = null;
        try {
          await sock.sendMessage(jid, {
            text: `⏳ [${i + 1}/${tracks.length}] ${track.title}\n${mode === "audio" ? "🎵 Preparando áudio..." : "🎬 Preparando vídeo..."}`
          });
          const result = await Downloader.download(track.url, { type: mode });
          file = result.file;
          if (!file) throw new Error("O servidor não retornou um arquivo.");

          const title = safeName(result.title || track.title);
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
