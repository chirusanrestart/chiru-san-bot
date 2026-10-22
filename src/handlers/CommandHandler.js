import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isGroupEnabled } from "../services/groupState.js";
import { isOwnerMessage } from "../services/ownerAuth.js";
import { validateCommandRequest } from "../security/commandGuard.js";

const ALWAYS_ALLOWED_WHEN_OFF = new Set(["on", "off", "ban", "kick", "remover"]);

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
        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption;

        const normalizedText = text?.trimStart();
        if (!normalizedText || !normalizedText.startsWith(".")) return;

        const args = normalizedText.slice(1).trim().split(/\s+/);
        const commandName = args.shift()?.toLowerCase();
        const command = this.commands.get(commandName);
        if (!command) return;

        const jid = msg.key?.remoteJid;
        if (!jid) return;

        // Todo comando passa pelo guarda antes de executar qualquer ação.
        const guard = validateCommandRequest(text);
        if (guard.blocked) {
            await this.sock.sendMessage(jid, {
                text: guard.reason === "guard_evasion"
                    ? "🔒 Não posso executar pedidos para contornar as proteções do bot. 🌸"
                    : "🔒 Esse assunto está bloqueado neste bot. Vamos tentar outro tema? 🌸"
            }, { quoted: msg });
            return;
        }

        // Os comandos da categoria owner exigem autenticação explícita.
        if (command.ownerOnly && !(await isOwnerMessage(msg))) {
            await this.sock.sendMessage(jid, {
                text: "⛔ Esse comando é exclusivo da dona do bot."
            }, { quoted: msg });
            return;
        }

        // .on e .off sempre funcionam; .ban continua disponível com o grupo desligado.
        if (
            jid.endsWith("@g.us") &&
            !ALWAYS_ALLOWED_WHEN_OFF.has(commandName) &&
            !(await isGroupEnabled(jid))
        ) {
            await this.sock.sendMessage(jid, {
                text: "🔕 O bot está desligado neste grupo. Só .on, .off e .ban continuam disponíveis."
            }, { quoted: msg });
            return;
        }

        msg.commandHandler = this;
        await command.execute(this.sock, msg, args);
    }
}
