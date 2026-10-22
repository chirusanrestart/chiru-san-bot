import Downloader from "../../services/downloader.js";
import { promises as fs } from "node:fs";

export default {
  name: "mp4",
  description: "Baixa vídeo em MP4 com capa e descrição quando disponíveis",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const url = args[0];

    if (!url) {
      await sock.sendMessage(jid, {
        text: "🎬 Envie o link do vídeo.\nExemplo: .mp4 https://youtu.be/..."
      });
      return;
    }

    let downloadedFile = null;
    try {
      await sock.sendMessage(jid, { text: "🎬 Baixando o vídeo e buscando a capinha..." });
      const result = await Downloader.download(url, {
        type: "video",
        requesterJid: msg.key.participant || msg.key.remoteJid
      });
      downloadedFile = result.file;

      const description = result.description || result.title || "Vídeo baixado pelo Chiru-san Bot.";

      if (result.thumbnail) {
        await sock.sendMessage(jid, {
          image: { url: result.thumbnail },
          caption: `🎬 ${result.title || "Vídeo"}\n\n${description}`
        }).catch(() => {});
      }

      await sock.sendMessage(jid, {
        video: { url: result.file },
        mimetype: "video/mp4",
        caption: result.title || "Download concluído."
      });
    } catch (err) {
      console.error("[mp4]", err);
      await sock.sendMessage(jid, { text: `❌ Não consegui baixar esse vídeo: ${err.message}` });
    } finally {
      if (downloadedFile) await fs.unlink(downloadedFile).catch(() => {});
    }
  }
};
