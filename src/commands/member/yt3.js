import { promises as fs } from "node:fs";
import Downloader from "../../services/downloader.js";
import { isMelissaApiConfigured, searchYouTube } from "../../services/melissaApi.js";
import { searchYoutube as searchLocal } from "../../services/youtubeSearch.js";

export default {
  name: "yt3",
  aliases: [],
  description: "Pesquisa uma música pelo nome e envia a capa e o áudio",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const query = args.join(" ").trim();
    if (!query) {
      await sock.sendMessage(jid, {
        text: "🎵 Digite o nome da música.\nExemplo: .yt3 nome da música"
      }, { quoted: msg });
      return;
    }

    let file = null;
    try {
      await sock.sendMessage(jid, { text: "🔎 Pesquisando no YouTube..." }, { quoted: msg });
      const video = isMelissaApiConfigured()
        ? await searchYouTube(query)
        : await searchLocal(query);
      if (!video?.url) {
        await sock.sendMessage(jid, { text: "❌ Não encontrei nenhum resultado." }, { quoted: msg });
        return;
      }

      const result = await Downloader.download(video.url, { type: "audio" });
      file = result.file;
      if (!file) throw new Error("O servidor não retornou um arquivo de áudio.");

      const title = String(result.title || video.title || "audio").replace(/\.(mp3|m4a|webm|opus)$/i, "");
      const thumbnail = result.thumbnail || video.thumbnail || video.image || null;

      if (thumbnail) {
        await sock.sendMessage(jid, {
          image: { url: thumbnail },
          caption: `🎵 *${title}*\n🎧 Aqui está sua música!`
        }, { quoted: msg }).catch(error => {
          console.warn("[YT AUDIO] Não consegui enviar a capa:", error.message);
        });
      }

      await sock.sendMessage(jid, {
        audio: { url: file },
        mimetype: result.contentType?.startsWith("audio/") ? result.contentType : "audio/mpeg",
        fileName: title + (result.contentType?.includes("audio/mp4") ? ".m4a" : ".mp3"),
        ptt: false
      }, { quoted: msg });
    } catch (error) {
      console.error("[YT AUDIO]", error);
      await sock.sendMessage(jid, {
        text: `❌ Não consegui pesquisar ou enviar o áudio: ${String(error.message || "").slice(0, 250)}`
      }, { quoted: msg });
    } finally {
      if (file) await fs.unlink(file).catch(() => {});
    }
  }
};
