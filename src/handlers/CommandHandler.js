import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

                // Preserve explicit categories; otherwise use the folder the command came from.
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
        const commandName = args.shift();
        const command = this.commands.get(commandName);

        if (!command) return;

        // Disponibiliza o registro de comandos para comandos como .menu.
        msg.commandHandler = this;
        await command.execute(this.sock, msg, args);
    }
}
