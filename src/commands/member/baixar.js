import { promises as fs } from "node:fs";
import Downloader from "../../services/downloader.js";

export default {
  name: "baixar",
  aliases: ["download", "dl"],
  description: "Baixa vídeo ou áudio de um link usando a Melissa API quando configurada",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || "";
    const input = [...args, ...(quotedText ? [quotedText] : [])].join(" ").trim();

    if (!input) {
      return sock.sendMessage(jid, {
        text: "📥 *Downloader Melissa*\n\nUso:\n.baixar vídeo LINK\n.baixar áudio LINK\n\nTambém aceita .download e .dl."
      }, { quoted: msg });
    }

    let type = "video";
    let urlText = input;
    const modeMatch = input.match(/^(?:video|vídeo|v|audio|áudio|a)\s+/i);
    if (modeMatch) {
      const mode = modeMatch[0].trim().toLowerCase();
      type = ["audio", "áudio", "a"].includes(mode) ? "audio" : "video";
      urlText = input.slice(modeMatch[0].length).trim();
    }

    const urlMatch = urlText.match(/https?:\/\/[^\s<>]+/i);
    if (!urlMatch) {
      return sock.sendMessage(jid, {
        text: "❌ Não encontrei um link HTTP/HTTPS válido.\nExemplo: .baixar áudio https://..."
      }, { quoted: msg });
    }

    const url = urlMatch[0].replace(/[),.!?]+$/, "");
    let result;

    await sock.sendMessage(jid, {
      text: type === "audio"
        ? "🎵 Baixando o áudio... já já envio!"
        : "🎬 Baixando o vídeo... segura só um pouquinho!"
    }, { quoted: msg });

    try {
      result = await Downloader.download(url, { type });
      const file = result?.file;
      if (!file) throw new Error("O serviço de download não retornou um arquivo.");

      const contentType = String(result.contentType || "").toLowerCase();
      const isAudio = type === "audio" || contentType.startsWith("audio/");
      const mimetype = isAudio
        ? (contentType.startsWith("audio/") ? contentType : (/\.m4a$/i.test(file) ? "audio/mp4" : "audio/mpeg"))
        : (contentType.startsWith("video/") ? contentType : "video/mp4");

      const title = String(result.title || (isAudio ? "Áudio" : "Vídeo"))
        .replace(/[\r\n]/g, " ")
        .slice(0, 180);

      if (isAudio) {
        await sock.sendMessage(jid, {
          audio: { url: file },
          mimetype,
          fileName: title,
          ptt: false
        }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, {
          video: { url: file },
          mimetype,
          fileName: title,
          caption: title
        }, { quoted: msg });
      }
    } catch (error) {
      console.error("[BAIXAR] Falha:", error);
      await sock.sendMessage(jid, {
        text: "❌ Não consegui baixar esse link. Confere se ele é público e tenta novamente.\n\nDetalhe: " + String(error?.message || error).slice(0, 250)
      }, { quoted: msg });
    } finally {
      if (result?.file) await fs.unlink(result.file).catch(() => {});
    }
  }
};
