import Downloader from "../../services/downloader.js";
import { promises as fs } from "node:fs";
import { isMelissaApiConfigured, searchYouTube } from "../../services/melissaApi.js";
import { searchYoutube as searchLocal } from "../../services/youtubeSearch.js";

export default {
  name: "mp3",
  description: "Baixa áudio por link ou pesquisa pelo nome no YouTube",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const input = args.join(" ").trim();
    if (!input) {
      await sock.sendMessage(jid, {
        text: "🎵 Envie um link ou o nome da música.\nExemplos:\n.mp3 https://youtu.be/...\n.mp3 nome da música"
      }, { quoted: msg });
      return;
    }

    let url = input.match(/https?:\/\/[^\s<>]+/i)?.[0]?.replace(/[),.!?]+$/, "");
    let searchedTitle = "";
    let downloadedFile = null;
    try {
      if (!url) {
        await sock.sendMessage(jid, { text: "🔎 Pesquisando a música no YouTube..." }, { quoted: msg });
        const found = isMelissaApiConfigured() ? await searchYouTube(input) : await searchLocal(input);
        if (!found?.url) throw new Error("Não encontrei essa música no YouTube.");
        url = found.url;
        searchedTitle = found.title || "";
      }

      await sock.sendMessage(jid, { text: "🎵 Preparando o áudio..." }, { quoted: msg });
      const result = await Downloader.download(url, { type: "audio" });
      downloadedFile = result.file;
      if (!downloadedFile) throw new Error("O servidor não retornou o áudio.");

      const title = String(result.title || searchedTitle || "audio").replace(/\.(mp3|m4a|webm|opus)$/i, "");
      if (result.thumbnail) {
        await sock.sendMessage(jid, { image: { url: result.thumbnail }, caption: `🎵 ${title}` }).catch(() => {});
      }
      const isM4a = String(result.contentType || "").toLowerCase().includes("audio/mp4");
      await sock.sendMessage(jid, {
        audio: { url: downloadedFile },
        mimetype: isM4a ? "audio/mp4" : "audio/mpeg",
        fileName: title + (isM4a ? ".m4a" : ".mp3"),
        ptt: false
      }, { quoted: msg });
    } catch (err) {
      console.error("[mp3]", err);
      await sock.sendMessage(jid, { text: `❌ Não consegui baixar esse áudio: ${String(err.message || "").slice(0, 300)}` }, { quoted: msg });
    } finally {
      if (downloadedFile) await fs.unlink(downloadedFile).catch(() => {});
    }
  }
};
