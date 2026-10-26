import Downloader from "../../services/downloader.js";
import { promises as fs } from "node:fs";
import { isMelissaApiConfigured, searchYouTube } from "../../services/melissaApi.js";
import { searchYoutube as searchLocal } from "../../services/youtubeSearch.js";

export default {
  name: "mp4",
  description: "Baixa vídeo por link ou pesquisa pelo nome no YouTube",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const input = args.join(" ").trim();
    if (!input) {
      await sock.sendMessage(jid, {
        text: "🎬 Envie um link ou o nome do vídeo.\nExemplos:\n.mp4 https://youtu.be/...\n.mp4 nome do vídeo"
      }, { quoted: msg });
      return;
    }

    let url = input.match(/https?:\/\/[^\s<>]+/i)?.[0]?.replace(/[),.!?]+$/, "");
    let searchedTitle = "";
    let downloadedFile = null;
    try {
      if (!url) {
        await sock.sendMessage(jid, { text: "🔎 Pesquisando o vídeo no YouTube..." }, { quoted: msg });
        const found = isMelissaApiConfigured() ? await searchYouTube(input) : await searchLocal(input);
        if (!found?.url) throw new Error("Não encontrei esse vídeo no YouTube.");
        url = found.url;
        searchedTitle = found.title || "";
      }

      await sock.sendMessage(jid, { text: "🎬 Preparando o vídeo..." }, { quoted: msg });
      const result = await Downloader.download(url, { type: "video" });
      downloadedFile = result.file;
      if (!downloadedFile) throw new Error("O servidor não retornou o vídeo.");

      const title = String(result.title || searchedTitle || "Vídeo").replace(/\.(mp4|webm|mov|mkv)$/i, "");
      const description = String(result.description || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 900);
      if (result.thumbnail) {
        await sock.sendMessage(jid, {
          image: { url: result.thumbnail },
          caption: `🎬 ${title}${description ? "\n\n" + description : ""}`
        }).catch(() => {});
      }
      await sock.sendMessage(jid, {
        video: { url: downloadedFile },
        mimetype: result.contentType?.startsWith("video/") ? result.contentType : "video/mp4",
        fileName: title + ".mp4",
        caption: `🎬 ${title}`
      }, { quoted: msg });
    } catch (err) {
      console.error("[mp4]", err);
      await sock.sendMessage(jid, { text: `❌ Não consegui baixar esse vídeo: ${String(err.message || "").slice(0, 300)}` }, { quoted: msg });
    } finally {
      if (downloadedFile) await fs.unlink(downloadedFile).catch(() => {});
    }
  }
};
