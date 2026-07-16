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


        try {

            await sock.sendMessage(from, {
                text: "🔎 Procurando no YouTube..."
            });


            const video = await searchYoutube(query);


            if (!video) {
                return sock.sendMessage(from, {
                    text: "❌ Não encontrei nenhum vídeo."
                });
            }


            await sock.sendMessage(from, {
                text:
`🎵 Encontrado:
${video.title}

⬇️ Baixando áudio...`
            });


            const audio = await downloadAudio(video.url);


            await sock.sendMessage(from, {
                audio: {
                    url: audio
                },
                mimetype: "audio/mpeg"
            });


        } catch (err) {

            console.log("Erro no comando yt:", err);


            await sock.sendMessage(from, {
                text: "❌ Deu erro ao baixar o áudio."
            });

        }

    }
};
