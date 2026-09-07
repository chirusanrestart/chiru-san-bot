import { promises as fs } from "node:fs";
import path from "node:path";

import {
  getPlaylistTracks
} from "../../services/youtubePlaylist.js";

import {
  downloadYoutubeAudioFast
} from "../../services/youtubeDownload.js";

const TEMP_DIR = path.resolve("temp/playlist");

export default {
  name: "playlist",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const url = args[0];

    if (!url) {
      await sock.sendMessage(jid, {
        text:
          "❌ Envie o link da playlist.\n\n" +
          "Exemplo:\n" +
          ".playlist https://music.youtube.com/playlist?list=..."
      });
      return;
    }

    if (
      !url.includes("youtube.com/playlist") &&
      !url.includes("music.youtube.com/playlist")
    ) {
      await sock.sendMessage(jid, {
        text: "❌ Esse link não parece ser uma playlist do YouTube."
      });
      return;
    }

    try {
      await fs.mkdir(TEMP_DIR, {
        recursive: true
      });

      await sock.sendMessage(jid, {
        text: "🔎 Lendo a playlist..."
      });

      const tracks = await getPlaylistTracks(url);

      console.log(
        `[PLAYLIST] ${tracks.length} músicas encontradas.`
      );

      await sock.sendMessage(jid, {
        text:
          `🎵 Playlist encontrada!\n\n` +
          `📀 ${tracks.length} músicas\n` +
          `⬇️ Vou baixar uma por uma...`
      });

      let success = 0;
      let failed = 0;

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];

        let sourceFile = null;

        try {
          await sock.sendMessage(jid, {
            text:
              `🎵 [${i + 1}/${tracks.length}]\n` +
              `${track.title}\n\n` +
              `⬇️ Baixando...`
          });

          console.log(
            `[PLAYLIST] [${i + 1}/${tracks.length}] ${track.title}`
          );

          sourceFile = await downloadYoutubeAudioFast(
            track.url,
            `${i + 1}-${track.title}`
          );

          const ext = path.extname(sourceFile).toLowerCase();

          let mimetype = "application/octet-stream";

          if (ext === ".webm") {
            mimetype = "audio/webm";
          } else if (ext === ".m4a") {
            mimetype = "audio/mp4";
          } else if (ext === ".opus") {
            mimetype = "audio/ogg; codecs=opus";
          } else if (ext === ".ogg") {
            mimetype = "audio/ogg";
          }

          console.log(
            `[PLAYLIST] 📦 Arquivo baixado: ${sourceFile}`
          );

          console.log(
            `[PLAYLIST] 📤 Enviando: ${track.title}${ext}`
          );

          await sock.sendMessage(jid, {
            document: {
              url: sourceFile
            },
            mimetype,
            fileName: `${track.title}${ext}`
          });

          success++;

          console.log(
            `[PLAYLIST] ✅ [${i + 1}/${tracks.length}] ${track.title}`
          );

          await fs.unlink(sourceFile).catch(() => {});

          sourceFile = null;

        } catch (err) {
          failed++;

          console.error(
            `[PLAYLIST] ❌ [${i + 1}/${tracks.length}]`,
            err
          );

          await sock.sendMessage(jid, {
            text:
              `❌ Não consegui enviar:\n` +
              `${track.title}\n\n` +
              `⏭️ Pulando para a próxima...`
          });

        } finally {
          if (sourceFile) {
            try {
              await fs.unlink(sourceFile);
            } catch {}
          }
        }
      }

      await sock.sendMessage(jid, {
        text:
          `✅ Playlist concluída!\n\n` +
          `🎵 Enviadas: ${success}\n` +
          `❌ Falharam: ${failed}\n` +
          `📀 Total: ${tracks.length}`
      });

      console.log(
        `[PLAYLIST] Finalizada: ${success} sucesso / ${failed} falhas`
      );

    } catch (err) {
      console.error(
        "[PLAYLIST] Erro:",
        err
      );

      await sock.sendMessage(jid, {
        text:
          `❌ Não consegui processar a playlist.\n\n` +
          `${err.message}`
      });
    }
  }
};

