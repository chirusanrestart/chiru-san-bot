import Downloader from "../../services/downloader.js";
import { promises as fs } from "node:fs";

export default {
  name: "instagram",
  description: "Baixa vídeos públicos do Instagram quando compatíveis com yt-dlp",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const url = args[0];

    if (!url) {
      await sock.sendMessage(jid, {
        text: "📥 Envie o link público do Instagram.\nExemplo: .instagram https://..."
      });
      return;
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      await sock.sendMessage(jid, { text: "❌ Link inválido." });
      return;
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const allowed = ["instagram.com","instagr.am"];
    if (!allowed.some(domain => host === domain || host.endsWith("." + domain))) {
      await sock.sendMessage(jid, { text: "❌ Esse link não parece ser do Instagram." });
      return;
    }

    let downloadedFile = null;
    try {
      await sock.sendMessage(jid, { text: "📥 Baixando o vídeo... a versão sem marca-d'água depende do arquivo que a plataforma disponibilizar." });
      const result = await Downloader.download(url, { type: "video" });
      downloadedFile = result.file;

      const caption = [result.title, result.description].filter(Boolean).join("\n\n").slice(0, 3000) || "Vídeo baixado.";
      if (result.thumbnail) {
        await sock.sendMessage(jid, { image: { url: result.thumbnail }, caption }).catch(() => {});
      }
      await sock.sendMessage(jid, {
        video: { url: result.file },
        mimetype: "video/mp4",
        caption: (result.title || "Vídeo baixado.").slice(0, 1000)
      });
    } catch (err) {
      console.error("[instagram]", err);
      await sock.sendMessage(jid, { text: `❌ Não consegui baixar esse vídeo: ${err.message}` });
    } finally {
      if (downloadedFile) await fs.unlink(downloadedFile).catch(() => {});
    }
  }
};
