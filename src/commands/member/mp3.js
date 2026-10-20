import Downloader from "../../services/downloader.js";
import { promises as fs } from "node:fs";

export default {
  name: "mp3",
  description: "Baixa áudio em MP3 com capa quando disponível",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const url = args[0];

    if (!url) {
      await sock.sendMessage(jid, {
        text: "🎵 Envie o link da música.\nExemplo: .mp3 https://youtu.be/..."
      });
      return;
    }

    let downloadedFile = null;
    try {
      await sock.sendMessage(jid, { text: "🎵 Preparando seu MP3 e procurando a capinha..." });
      const result = await Downloader.download(url, { type: "audio" });
      downloadedFile = result.file;

      if (result.thumbnail) {
        await sock.sendMessage(jid, {
          image: { url: result.thumbnail },
          caption: `🎵 ${result.title || "Música"}`
        }).catch(() => {});
      }

      await sock.sendMessage(jid, {
        audio: { url: result.file },
        mimetype: "audio/mpeg",
        fileName: `${result.title || "audio"}.mp3`
      });
    } catch (err) {
      console.error("[mp3]", err);
      await sock.sendMessage(jid, { text: `❌ Não consegui baixar esse áudio: ${err.message}` });
    } finally {
      if (downloadedFile) await fs.unlink(downloadedFile).catch(() => {});
    }
  }
};
