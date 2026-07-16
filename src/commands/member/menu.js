export default {

    name: "menu",

    description: "Mostra todos os comandos",

    async execute(sock, msg) {


        const commandHandler =
            msg.commandHandler;


        let menu =
            "╭━━━〔 🤖 Chiru Bot 〕━━━╮\n\n";


        menu += "📌 Comandos disponíveis:\n\n";


        for (const [name, command] of commandHandler.commands) {

            menu += `• .${name}\n`;

        }


        menu += "\n╰━━━━━━━━━━━━━━━━━━╯";


        await sock.sendMessage(
            msg.key.remoteJid,
            {
                text: menu
            }
        );


    }

};
