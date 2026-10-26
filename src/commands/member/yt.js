import { promises as fs } from "node:fs";
import Downloader from "../../services/downloader.js";
import { isMelissaApiConfigured, searchYouTube } from "../../services/melissaApi.js";
import { searchYoutube as searchLocal } from "../../services/youtubeSearch.js";

export default {
  name: "yt",
  aliases: ["ytaudio"],
  description: "Pesquisa uma música pelo nome e envia o áudio pelo servidor",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const query = args.join(" ").trim();
    if (!query) {
      await sock.sendMessage(jid, {
        text: "🎵 Digite o nome da música.\nExemplo: .yt nome da música"
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
        text: `🎵 Encontrei: ${video.title}\n\n⬇️ Preparando o áudio...`
      }, { quoted: msg });

      const result = await Downloader.download(video.url, { type: "audio" });
      file = result.file;
      if (!file) throw new Error("O servidor não retornou um arquivo de áudio.");

      await sock.sendMessage(jid, {
        audio: { url: file },
        mimetype: result.contentType?.startsWith("audio/") ? result.contentType : "audio/mpeg",
        fileName: (result.title || video.title || "audio").replace(/\.(mp3|m4a|webm|opus)$/i, "") + ".mp3",
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
