import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isGroupEnabled } from "../services/groupState.js";
import { isOwnerMessage } from "../services/ownerAuth.js";
import { handleLoteMessage } from "../services/loteCollector.js";

const ALWAYS_ALLOWED_WHEN_OFF = new Set(["on", "off", "ban", "kick", "remover"]);

const MEDIA_COMMANDS = new Set(["mp3", "mp4"]);

async function getJpegThumbnail(url) {
    if (!url) return undefined;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") return undefined;
        const response = await fetch(parsed, {
            signal: AbortSignal.timeout(5000),
            redirect: "error"
        });
        if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/jpeg")) return undefined;
        const length = Number(response.headers.get("content-length") || 0);
        if (length > 256 * 1024) return undefined;
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length || bytes.length > 256 * 1024) return undefined;
        return bytes;
    } catch {
        return undefined;
    }
}

async function executeMediaDownload(sock, msg, args, commandName) {
    const jid = msg.key?.remoteJid;
    if (!jid) return;
    const input = args.join(" ").trim();
    const match = input.match(/https?:\/\/[^\s<>]+/i);
    if (!match) {
        await sock.sendMessage(jid, {
            text: commandName === "mp3"
                ? "🎵 Envie o link depois do comando.\nExemplo: .mp3 https://..."
                : "🎬 Envie o link depois do comando.\nExemplo: .mp4 https://..."
        }, { quoted: msg });
        return;
    }

    const url = match[0].replace(/[),.!?]+$/, "");
    const type = commandName === "mp3" ? "audio" : "video";
    let result;
    await sock.sendMessage(jid, {
        text: type === "audio" ? "🎵 Preparando o MP3..." : "🎬 Preparando o MP4..."
    }, { quoted: msg });

    try {
        const { default: Downloader } = await import("../services/downloader.js");
        result = await Downloader.download(url, { type });
        if (!result?.file) throw new Error("O serviço não retornou um arquivo.");
        const cleanText = value => String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
        const rawTitle = cleanText(result.title || (type === "audio" ? "audio" : "video"));
        const title = rawTitle.replace(/\.(mp3|mp4|m4a|webm|mov)$/i, "").slice(0, 170) || (type === "audio" ? "audio" : "video");
        const description = String(result.description || "")
            .replace(/\r/g, "")
            .split("\n")
            .map(line => line.replace(/[\t ]+/g, " ").trim())
            .filter(Boolean)
            .join("\n")
            .slice(0, 1200);
        const contentType = String(result.contentType || "").toLowerCase();

        if (type === "audio") {
            await sock.sendMessage(jid, {
                audio: { url: result.file },
                mimetype: contentType.startsWith("audio/") ? contentType : "audio/mpeg",
                fileName: /\.mp3$/i.test(title) ? title : title + ".mp3",
                ptt: false
            }, { quoted: msg });
        } else {
            const jpegThumbnail = await getJpegThumbnail(result.thumbnail);
            await sock.sendMessage(jid, {
                video: { url: result.file },
                mimetype: contentType.startsWith("video/") ? contentType : "video/mp4",
                fileName: title + ".mp4",
                ...(jpegThumbnail ? { jpegThumbnail } : {}),
                caption: description ? `🎬 ${title}\n\n📝 ${description}` : `🎬 ${title}`
            }, { quoted: msg });
        }
    } catch (error) {
        console.error("[" + commandName.toUpperCase() + "] Falha:", error);
        await sock.sendMessage(jid, {
            text: "❌ Não consegui baixar esse link. Confere se ele é público e tenta novamente."
        }, { quoted: msg });
    } finally {
        if (result?.file) await fs.unlink(result.file).catch(() => {});
    }
}


export default class CommandHandler {
    constructor(sock) {
        this.sock = sock;
        this.commands = new Map();
    }

    async loadCommands() {
        const folders = ["member", "admin", "owner"];

        for (const folder of folders) {
            const dir = path.resolve(`src/commands/${folder}`);

            let files;
            try {
                files = (await fs.readdir(dir, { withFileTypes: true }))
                    .filter(entry => entry.isFile() && entry.name.endsWith(".js"))
                    .map(entry => entry.name);
            } catch (error) {
                if (error.code === "ENOENT") continue;
                throw error;
            }

            for (const file of files) {
                // playlist.js é o núcleo interno usado por .playlist3/.playlist4, não um comando público.
                if (folder === "member" && file === "playlist.js") continue;

                const command = await import(
                    pathToFileURL(path.join(dir, file)).href
                );

                const cmd = command.default;
                if (!cmd?.name || typeof cmd.execute !== "function") {
                    console.warn(`⚠️ Comando ignorado (formato inválido): ${file}`);
                    continue;
                }

                cmd.category = cmd.category || folder;
                this.commands.set(cmd.name, cmd);

                for (const alias of cmd.aliases || []) {
                    this.commands.set(alias, cmd);
                }

                console.log(`📌 Comando carregado: ${cmd.name}`);
            }
        }
    }

    async handle(msg) {
        if (await handleLoteMessage(this.sock, msg)) return;

        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption;

        const normalizedText = text?.trimStart();
        if (!normalizedText || !normalizedText.startsWith(".")) return;

        const args = normalizedText.slice(1).trim().split(/\s+/);
        const commandName = args.shift()?.toLowerCase();
        let command = this.commands.get(commandName);

        // .pack2 até .pack10 reutilizam o comando .pack e sua fila FIFO.
        const packBatchMatch = commandName?.match(/^pack(2|3|4|5|6|7|8|9|10)$/);
        if (!command && packBatchMatch) {
            command = this.commands.get("pack");
            if (command) msg.packCount = Number(packBatchMatch[1]);
        }

        if (!command && MEDIA_COMMANDS.has(commandName)) {
            const mediaJid = msg.key?.remoteJid;
            if (
                mediaJid?.endsWith("@g.us") &&
                !(await isGroupEnabled(mediaJid))
            ) {
                await this.sock.sendMessage(mediaJid, {
                    text: "🔕 O bot está desligado neste grupo. Só .on, .off, .ban, .kick e .remover continuam disponíveis."
                }, { quoted: msg });
                return;
            }
            await executeMediaDownload(this.sock, msg, args, commandName);
            return;
        }
        if (!command) return;

        const jid = msg.key?.remoteJid;
        if (!jid) return;

        // Os comandos da categoria owner exigem autenticação explícita.
        if (command.ownerOnly && !(await isOwnerMessage(msg))) {
            await this.sock.sendMessage(jid, {
                text: "⛔ Esse comando é exclusivo da dona do bot."
            }, { quoted: msg });
            return;
        }

        // .on, .off, .ban, .kick e .remover continuam disponíveis com o grupo desligado.
        if (
            jid.endsWith("@g.us") &&
            !ALWAYS_ALLOWED_WHEN_OFF.has(commandName) &&
            !(await isGroupEnabled(jid))
        ) {
            await this.sock.sendMessage(jid, {
                text: "🔕 O bot está desligado neste grupo. Só .on, .off, .ban, .kick e .remover continuam disponíveis."
            }, { quoted: msg });
            return;
        }

        msg.commandHandler = this;

        if (msg.packCount > 1 && command.name === "pack") {
            const count = Math.min(10, Math.max(2, msg.packCount));
            let statusMessageKey = null;
            const batchState = {
                sequential: true,
                remaining: count,
                failed: false,
                finalized: false,
                updateStatus: async () => {
                    const completed = count - batchState.remaining;
                    const text = batchState.remaining === 0
                        ? (batchState.failed
                            ? `⚠️ Lote finalizado: ${completed}/${count} packs concluídos.`
                            : `✅ Lote concluído! ${count} packs processados.`)
                        : `☁️ Processando lote de packs\n\n📦 Pack: *${completed + 1}/${count}*\n✅ Concluídos: *${completed}*\n⏳ Restantes: *${batchState.remaining}*\n\nA nuvem está trabalhando em um pack por vez.`;

                    if (!statusMessageKey) {
                        const sent = await this.sock.sendMessage(jid, { text }, { quoted: msg });
                        statusMessageKey = sent?.key || null;
                    } else {
                        await this.sock.sendMessage(jid, { text, edit: statusMessageKey });
                    }
                }
            };

            msg.packBatch = batchState;
            await batchState.updateStatus();

            // Cada execução espera a conclusão do pack atual antes de enfileirar o próximo.
            for (let index = 0; index < count; index++) {
                await command.execute(this.sock, msg, args);
            }
            return;
        }

        await command.execute(this.sock, msg, args);
    }
}
