import readline from "node:readline";
import CommandHandler from "./src/handlers/CommandHandler.js";

import {
    getGroupCommandLimits,
    setCommandEnabled
} from "./src/services/commandLimiter.js";

const FIXED_ON_COMMANDS = new Set(["identificador"]);
const SPECIAL_COMMANDS = ["mp3", "mp4"];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise(resolve => {
        rl.question(prompt, resolve);
    });
}

async function main() {
    try {
        console.log("\n🌸 Chiru-san Bot • Limitador por grupo\n");

        const groupJid = (await question("🆔 Identificador do grupo: ")).trim();

        if (!/^\d+(?:-\d+)?@g\.us$/.test(groupJid)) {
            console.error("❌ Identificador inválido. Use o JID terminado em @g.us.");
            process.exitCode = 1;
            return;
        }

        const commandHandler = new CommandHandler({
            async sendMessage() {
                throw new Error("O limitador local não envia mensagens ao WhatsApp.");
            }
        });

        await commandHandler.loadCommands();

        const commandNames = new Set();

        for (const command of commandHandler.commands.values()) {
            if (command?.name) {
                commandNames.add(String(command.name).toLowerCase());
            }
        }

        for (const commandName of SPECIAL_COMMANDS) {
            commandNames.add(commandName);
        }

        const commands = [...commandNames].sort((a, b) => a.localeCompare(b));
        const knownCommands = new Set(commands);
        const limits = await getGroupCommandLimits(groupJid);

        console.log("\n⚙️ LIMITADOR");
        console.log("Grupo: " + groupJid);
        console.log("");

        for (const commandName of commands) {
            const state = FIXED_ON_COMMANDS.has(commandName)
                ? "ON*"
                : limits[commandName] === false
                    ? "OFF"
                    : "ON";

            console.log("[" + state.padEnd(3) + "] ." + commandName);
        }

        console.log("\n* .identificador fica sempre ligado para permitir recuperar o JID.");
        console.log("Digite: comando on | comando off | sair\n");

        while (true) {
            const input = (await question("limitador> ")).trim();

            if (!input) continue;
            if (input.toLowerCase() === "sair") break;

            const parts = input.split(/\s+/);

            if (parts.length !== 2) {
                console.log("⚠️ Formato: comando on/off");
                continue;
            }

            const commandName = parts[0].replace(/^\./, "").toLowerCase();
            const state = parts[1].toLowerCase();

            if (!knownCommands.has(commandName)) {
                console.log("❌ Comando não encontrado: ." + commandName);
                continue;
            }

            if (state !== "on" && state !== "off") {
                console.log("⚠️ O estado precisa ser on ou off.");
                continue;
            }

            if (FIXED_ON_COMMANDS.has(commandName)) {
                console.log("🔒 ." + commandName + " é fixo e permanece ON.");
                continue;
            }

            const enabled = state === "on";

            await setCommandEnabled(groupJid, commandName, enabled);
            limits[commandName] = enabled;

            console.log(
                (enabled ? "🟢 " : "🔴 ") +
                "." + commandName +
                " → " + state.toUpperCase() +
                " | 💾 salvo"
            );
        }

        console.log("\n💾 Configuração final salva em data/command-limits.json.");
        console.log("🔄 Reinicie o bot para carregar as alterações.");
    } finally {
        rl.close();
    }
}

main().catch(error => {
    console.error("❌ Erro no limitador:", error?.message || error);
    process.exitCode = 1;
});
