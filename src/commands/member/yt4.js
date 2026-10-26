import { promises as fs } from "node:fs";
import Downloader from "../../services/downloader.js";
import { isMelissaApiConfigured, searchYouTube } from "../../services/melissaApi.js";
import { searchYoutube as searchLocal } from "../../services/youtubeSearch.js";

export default {
  name: "yt4",
  aliases: [],
  description: "Pesquisa um vídeo pelo nome e envia a thumbnail e o vídeo",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const query = args.join(" ").trim();
    if (!query) {
      await sock.sendMessage(jid, {
        text: "🎬 Digite o nome do vídeo.\nExemplo: .yt4 nome do vídeo"
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

      const result = await Downloader.download(video.url, { type: "video" });
      file = result.file;
      if (!file) throw new Error("O servidor não retornou um arquivo de vídeo.");

      const title = result.title || video.title || "Vídeo";
      const thumbnail = result.thumbnail || video.thumbnail || video.image || null;
      if (thumbnail) {
        await sock.sendMessage(jid, {
          image: { url: thumbnail },
          caption: `🎬 *${title}*\n📹 Aqui está seu vídeo!`
        }, { quoted: msg }).catch(error => {
          console.warn("[YT VIDEO] Não consegui enviar a thumbnail:", error.message);
        });
      }

      await sock.sendMessage(jid, {
        video: { url: file },
        mimetype: result.contentType?.startsWith("video/") ? result.contentType : "video/mp4",
        caption: `🎬 ${title}`
      }, { quoted: msg });
    } catch (error) {
      console.error("[YT VIDEO]", error);
      await sock.sendMessage(jid, {
        text: `❌ Não consegui pesquisar ou enviar o vídeo: ${String(error.message || "").slice(0, 250)}`
      }, { quoted: msg });
    } finally {
      if (file) await fs.unlink(file).catch(() => {});
    }
  }
};
