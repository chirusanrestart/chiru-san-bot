import { exec } from "child_process";
import { promisify } from "util";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import fs from "fs/promises";
import crypto from "crypto";

const execAsync = promisify(exec);

export default {
    name: "nord",
    description: "Aplica estilo Nord em imagens",

    async execute(sock, msg) {
        try {
            const quoted =
                msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            const image =
                msg.message?.imageMessage ||
                quoted?.imageMessage;

            if (!image) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text: "❄️ Envie ou responda uma imagem usando .nord"
                    },
                    { quoted: msg }
                );
                return;
            }

            const target = quoted
                ? {
                    key: {
                        remoteJid: msg.key.remoteJid,
                        id: msg.message.extendedTextMessage.contextInfo.stanzaId
                    },
                    message: quoted
                }
                : msg;

            const buffer = await downloadMediaMessage(
                target,
                "buffer",
                {}
            );

            const id = crypto.randomBytes(5).toString("hex");

            const input = `./temp/${id}.jpg`;
            const output = `./temp/${id}-nord.jpg`;

            await fs.writeFile(input, buffer);

            // ❄️ Nord Theme Edition
            await execAsync(
                `ffmpeg -y -i "${input}" -vf "eq=contrast=1.15:brightness=0.03:saturation=0.82,colorbalance=rs=-0.08:gs=0.04:bs=0.28,curves=blue='0/0 0.45/0.55 0.75/0.82 1/1',unsharp=5:5:0.4" "${output}"`
            );

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    image: {
                        url: output
                    },
                    caption: "❄️ Nord Edition • Arctic Tone 💙"
                },
                { quoted: msg }
            );

            await fs.unlink(input).catch(() => {});
            await fs.unlink(output).catch(() => {});

        } catch (err) {
            console.error("Erro no nord:", err);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: "❌ Erro ao aplicar o filtro Nord."
                },
                { quoted: msg }
            );
        }
    }
};
