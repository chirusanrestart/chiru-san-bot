import Downloader from "../../services/downloader.js";

export default {

    name: "play",

    async execute(sock, msg, args) {

        const jid = msg.key.remoteJid;


        if (args.length === 0) {

            await sock.sendMessage(jid, {
                text:
                    "❌ Envie uma URL.\n\n" +
                    "Exemplos:\n" +
                    ".play https://youtu.be/...\n" +
                    ".play mp4 https://youtu.be/...\n" +
                    ".play mp3 https://youtu.be/..."
            });

            return;

        }


        let type = "video";
        let url;


        if (args[0] === "mp3") {

            type = "audio";
            url = args[1];


        } else if (args[0] === "mp4") {

            type = "video";
            url = args[1];


        } else {

            url = args[0];

        }


        if (!url) {

            await sock.sendMessage(jid, {
                text: "❌ URL não encontrada."
            });

            return;

        }


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

                text:
                    `❌ Erro: ${err.message}`

            });

        }

    }

};
