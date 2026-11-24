import { createReadStream } from "node:fs";

export async function transcribeAudioFile(client, filePath) {
    if (!client) {
        const error = new Error("GROQ_API_KEY não configurada.");
        error.code = "GROQ_TRANSCRIPTION_NOT_CONFIGURED";
        throw error;
    }
    if (typeof filePath !== "string" || !filePath.trim()) {
        throw new TypeError("O caminho do áudio para transcrição é inválido.");
    }

    const transcription = await client.audio.transcriptions.create({
        file: createReadStream(filePath),
        model: "whisper-large-v3-turbo",
        response_format: "json"
    });

    const text = transcription?.text?.trim();
    if (!text) {
        throw new Error("O Whisper não retornou texto para este áudio.");
    }
    return text;
}
