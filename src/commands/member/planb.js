import { promises as fs } from "node:fs";
import { downloadSaveFrom } from "../../services/savefrom.js";

export default {
  name: "planb",
  aliases: ["testsavefrom"],
  description: "Testa o SaveFrom diretamente com um link, sem usar a SaveAPI",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const url = args[0];

    if (!url) {
      await sock.sendMessage(jid, {
        text: "🧪 Envie um link para testar o SaveFrom.\nExemplo: .planb https://www.instagram.com/reel/..."
      });
      return;
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      await sock.sendMessage(jid, {
        text: "❌ Esse link não parece uma URL válida. Envie o link completo com https://."
      });
      return;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      await sock.sendMessage(jid, {
        text: "❌ Por segurança, o teste aceita somente links HTTP ou HTTPS."
      });
      return;
    }

    let downloadedFile = null;
    const startedAt = Date.now();

    try {
      await sock.sendMessage(jid, {
        text: "🧪🇧🇷 Testando o SaveFrom diretamente...\n⏳ Isso pode levar alguns segundos."
      });

      const result = await downloadSaveFrom(parsed.href);
      downloadedFile = result.file;

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const caption = [
        "✅ SaveFrom FUNCIONOU!",
        result.title || "Vídeo de teste",
        `⏱️ Tempo: ${elapsed}s`,
        "🧪 Teste direto concluído; a SaveAPI não foi usada."
      ].join("\n");

      await sock.sendMessage(jid, {
        video: { url: result.file },
        mimetype: "video/mp4",
        caption
      });

      console.log(`[planb] SaveFrom OK em ${elapsed}s: ${parsed.hostname}`);
    } catch (error) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.error("[planb] SaveFrom falhou:", error);

      await sock.sendMessage(jid, {
        text:
          `❌ O SaveFrom falhou neste teste.\n⏱️ Tempo: ${elapsed}s\n🌐 Site: ${parsed.hostname}\n\nMotivo: ${String(error?.message || error).slice(0, 900)}\n\nIsso não prova que o serviço esteja sempre fora do ar: o endpoint ou o formato da resposta pode ter mudado.`
      });
    } finally {
      if (downloadedFile) {
        await fs.unlink(downloadedFile).catch(() => {});
      }
    }
  }
};
