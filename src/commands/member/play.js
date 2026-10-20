import Downloader from "../../services/downloader.js";
import { promises as fs } from "node:fs";

export default {

    name: "play",
  description: "Baixa vídeos ou áudios a partir de uma URL",

    async execute(sock, msg, args) {

        const jid = msg.key.remoteJid;


        if (args.length === 0) {

            await sock.sendMessage(jid, {
                text:
                    "❌ Envie uma URL.\n\n" +
                    "Exemplos:\n" +
                    ".mp4 https://youtu.be/...\n" +
                    ".mp3 https://youtu.be/..."
            });

            return;

        }


        const type = "video";
        const url = args[0];

        if (!url) {

            await sock.sendMessage(jid, {
                text: "❌ URL não encontrada."
            });

            return;

        }


        let downloadedFile = null;

        try {

            await sock.sendMessage(jid, {
                text:
                    type === "audio"
                        ? "🎵 Baixando MP3..."
                        : "🎬 Baixando MP4..."
            });


            const result = await Downloader.download(
                url,
                {
                    type
                }
            );

            downloadedFile = result.file;


            if (type === "audio") {

                await sock.sendMessage(jid, {

                    audio: {
                        url: result.file
                    },

                    mimetype:
                        "audio/mpeg"

                });


            } else {

                await sock.sendMessage(jid, {

                    video: {
                        url: result.file
                    },

                    caption:
                        result.title ||
                        "Download concluído."

                });

            }


        } catch (err) {

            console.error(err);

            await sock.sendMessage(jid, {
                text: `❌ Erro: ${err.message}`
            });

        } finally {
            if (downloadedFile) {
                await fs.unlink(downloadedFile).catch(() => {});
            }
        }

    }

};
