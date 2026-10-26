import { promises as fs } from "node:fs";
import Downloader from "../../services/downloader.js";
import { isMelissaApiConfigured, searchYouTube } from "../../services/melissaApi.js";
import { searchYoutube as searchLocal } from "../../services/youtubeSearch.js";

export default {
  name: "yt4",
  aliases: [],
  description: "Pesquisa um vídeo pelo nome e envia o vídeo pelo servidor",

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
      await sock.sendMessage(jid, { text: "🔎 Pesquisando no YouTube pelo servidor..." }, { quoted: msg });
      const video = isMelissaApiConfigured()
        ? await searchYouTube(query)
        : await searchLocal(query);
      if (!video?.url) {
        await sock.sendMessage(jid, { text: "❌ Não encontrei nenhum resultado." }, { quoted: msg });
        return;
      }

      await sock.sendMessage(jid, {
        text: `🎬 Encontrei: ${video.title}\n\n⬇️ Preparando o vídeo...`
      }, { quoted: msg });

      const result = await Downloader.download(video.url, { type: "video" });
      file = result.file;
      if (!file) throw new Error("O servidor não retornou um arquivo de vídeo.");

      await sock.sendMessage(jid, {
        video: { url: file },
        mimetype: result.contentType?.startsWith("video/") ? result.contentType : "video/mp4",
        caption: `🎬 ${result.title || video.title || "Vídeo"}`
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
