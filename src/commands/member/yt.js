import { promises as fs } from "node:fs";

import { searchYoutube } from "../../services/youtubeSearch.js";
import { downloadAudio } from "../../services/youtubeDownload.js";

export default {
  name: "yt",

  async execute(sock, msg, args) {
    const from = msg.key.remoteJid;

    const query = args.join(" ");

    if (!query) {
      return sock.sendMessage(from, {
        text: "❌ Digite o nome da música."
      });
    }

    let audio = null;

    try {
      await sock.sendMessage(from, {
        text:
          "🔎 Procurando no YouTube..."
      });

      const video =
        await searchYoutube(query);

      if (!video) {
        return sock.sendMessage(from, {
          text:
            "❌ Não encontrei nenhum vídeo."
        });
      }

      await sock.sendMessage(from, {
        text:
`🎵 Encontrado:
${video.title}

⬇️ Baixando áudio...`
      });

      console.log(
        `[YT] 🎵 ${video.title}`
      );

      audio =
        await downloadAudio(video.url);

      await sock.sendMessage(from, {
        audio: {
          url: audio
        },
        mimetype: "audio/mpeg"
      });

      console.log(
        `[YT] ✅ Enviado: ${video.title}`
      );

    } catch (err) {
      console.error(
        "[YT] ❌ Erro:",
        err
      );

      await sock.sendMessage(from, {
        text:
          "❌ Deu erro ao baixar o áudio."
      });

    } finally {
      if (audio) {
        try {
          await fs.unlink(audio);

          console.log(
            `[YT] 🧹 Arquivo temporário removido`
          );
        } catch {}
      }
    }
  }
};
