export default {


    name: "ping",


    description: "Mostra a latência do bot",



    async execute(sock, msg) {


        const start = Date.now();



        await sock.sendMessage(
            msg.key.remoteJid,
            {
                text: "🏓 Ping..."
            }
        );



        const end = Date.now();



        await sock.sendMessage(
            msg.key.remoteJid,
            {
                text:
                `🏓 Pong!\n⚡ ${end - start}ms`
            }
        );


    }


};
