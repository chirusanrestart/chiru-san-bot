import path from "path";
import fs from "fs";

export default {

    name: "menu",

    description: "Mostra todos os comandos",

    async execute(sock, msg) {

        const commandHandler = msg.commandHandler;
        const jid = msg.key.remoteJid;
        const sender = msg.key.participant || jid;
        const number = sender.split("@")[0];

        const categories = {
            member: "👤 MEMBROS",
            admin: "🛡️ ADMINISTRAÇÃO",
            owner: "👑 DONA"
        };

        const commandsByCategory = {
            member: [],
            admin: [],
            owner: []
        };

        for (const [name, command] of commandHandler.commands) {
            const category = command.category || "member";

            if (commandsByCategory[category]) {
                commandsByCategory[category].push({
                    name,
                    description: command.description || "Sem descrição"
                });
            }
        }

        let menu = `╭━━━〔 🌸 CHIRU-SAN BOT 〕━━━╮
│
│ 💗 Olá, @${number}!
│ ✨ Seja bem-vinda ao meu menuzinho!
│
╰━━━━━━━━━━━━━━━━━━━━━━╯

`;

        for (const [category, title] of Object.entries(categories)) {
            const commands = commandsByCategory[category];

            if (!commands.length) continue;

            menu += `╭───〔 ${title} 〕───╮\n`;

            commands.forEach((command, index) => {
                const isLast = index === commands.length - 1;
                const prefix = isLast ? "└" : "├";

                menu += `│ ${prefix} .${command.name} • ${command.description}\n`;
            });

            menu += `╰────────────────────╯\n\n`;
        }

        menu += `🌸 Use .menu sempre que quiser ver os comandos!
💗 Feito com carinho pela Chiru-san`;

        // Caminho da imagem do menu
        const menuImage = path.join(
            process.cwd(),
            "assets",
            "bot",
            "menu.jpg"
        );

        // Se a imagem existir, envia imagem + menu
        if (fs.existsSync(menuImage)) {

            await sock.sendMessage(
                jid,
                {
                    image: {
                        url: menuImage
                    },
                    caption: menu,
                    mentions: [sender]
                }
            );

        } else {

            // Se não encontrar a imagem, envia somente o texto
            await sock.sendMessage(
                jid,
                {
                    text: menu,
                    mentions: [sender]
                }
            );

        }

    }

};
