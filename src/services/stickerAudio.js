import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { proto, generateWAMessageContent } from "@whiskeysockets/baileys";

const execFileAsync = promisify(execFile);

let stickerAudioProtoPatched = false;

function patchStickerAudioProto() {
    if (stickerAudioProtoPatched) return;

    const stickerProto = proto?.Message?.StickerMessage;
    const audioProto = proto?.Message?.AudioMessage;

    if (!stickerProto?.encode || !audioProto?.encode) {
        throw new Error("Baileys não expôs o proto necessário para figurinha com som.");
    }

    const originalEncode = stickerProto.encode.bind(stickerProto);

    stickerProto.encode = (message, writer) => {
        const result = originalEncode(message, writer);

        if (message?.audioMessage != null) {
            audioProto.encode(
                message.audioMessage,
                result.uint32(210).fork()
            ).ldelim();
        }

        return result;
    };

    stickerAudioProtoPatched = true;
}

export async function extractStickerAudio(input, output, duration = 5) {
    await execFileAsync(
        "ffmpeg",
        [
            "-y", "-i", input, "-t", String(duration), "-vn",
            "-ac", "1", "-ar", "48000", "-c:a", "libopus",
            "-b:a", "32k", "-avoid_negative_ts", "make_zero", output
        ],
        { maxBuffer: 16 * 1024 * 1024 }
    );

    const info = await fs.stat(output);

    if (info.size <= 0) {
        throw new Error("O vídeo não possui uma faixa de áudio utilizável.");
    }

    return output;
}

export async function sendStickerWithAudio(sock, jid, sticker, audio) {
    patchStickerAudioProto();

    const stickerContent = await generateWAMessageContent(
        { sticker },
        { upload: sock.waUploadToServer, logger: sock.logger }
    );

    const audioContent = await generateWAMessageContent(
        {
            audio,
            mimetype: "audio/ogg; codecs=opus",
            ptt: true
        },
        { upload: sock.waUploadToServer, logger: sock.logger }
    );

    const stickerMessage = stickerContent?.stickerMessage;

    if (!stickerMessage || !audioContent?.audioMessage) {
        throw new Error("Não foi possível preparar a figurinha com áudio.");
    }

    stickerMessage.audioMessage = audioContent.audioMessage;

    const message = proto.Message.create({
        stickerMessage
    });

    return sock.relayMessage(
        jid,
        message,
        { messageId: sock.generateMessageTag() }
    );
}
