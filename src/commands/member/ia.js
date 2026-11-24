import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { askAI, transcribeAudio } from "../../ai/groq.js";
import { downloadMediaToFile } from "../../utils/download.js";

export default {
    name: "ia",

    description: "Conversa com a Chiru-san e entende áudios",

    async execute(sock, msg, args) {
        const jid = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const audio = quoted?.audioMessage || msg.message?.audioMessage;
        const pergunta = args.join(" ").trim();
        let audioPath = null;

        if (!pergunta && !audio) {
            return await sock.sendMessage(jid, {
                text: "🌸 Escreve alguma coisa ou responde a um áudio com .ia para a Chiru-san entender~"
            });
        }

        try {
            let mensagemParaIA = pergunta;

            if (audio) {
                await sock.sendMessage(jid, {
                    text: "🎧 Recebi o áudio! Estou transcrevendo..."
                }, { quoted: msg });

                const mimetype = String(audio.mimetype || "").toLowerCase();
                const extension = mimetype.includes("mpeg") ? "mp3"
                    : mimetype.includes("mp4") ? "m4a"
                    : mimetype.includes("wav") ? "wav"
                    : mimetype.includes("flac") ? "flac"
                    : mimetype.includes("webm") ? "webm"
                    : "ogg";

                audioPath = `./temp/ia-audio-${randomUUID()}.${extension}`;
                await downloadMediaToFile(audio, "audio", audioPath);

                const transcricao = await transcribeAudio(audioPath);
                mensagemParaIA = pergunta
                    ? `${pergunta}\n\nTranscrição do áudio:\n${transcricao}`
                    : `O usuário enviou este áudio. Responda ao conteúdo dele:\n\n${transcricao}`;
            }

            const resposta = await askAI(jid, mensagemParaIA);

            await sock.sendMessage(jid, {
                text: resposta
            });
        } catch (error) {
            console.error("Erro na IA:", error);

            const mensagem = error.code === "GROQ_TRANSCRIPTION_NOT_CONFIGURED"
                ? "🎧 A transcrição de áudio precisa da GROQ_API_KEY configurada no .env."
                : "💔 A Chiru-san deu um bugzinho no cérebro...";

            await sock.sendMessage(jid, {
                text: mensagem
            });
        } finally {
            if (audioPath) {
                await unlink(audioPath).catch(() => {});
            }
        }
    }
};
