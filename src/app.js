import "dotenv/config";

import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} from "@whiskeysockets/baileys";

import P from "pino";
import { Boom } from "@hapi/boom";
import readline from "node:readline";

import CommandHandler from "./handlers/CommandHandler.js";


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


async function startBot() {


    const { state, saveCreds } =
        await useMultiFileAuthState("./auth");



    const { version } =
        await fetchLatestBaileysVersion();



    const sock =
        makeWASocket({

            version,

            auth: state,

            logger: P({
                level: "silent"
            })

        });



    const commandHandler =
        new CommandHandler(sock);



    await commandHandler.loadCommands();



    sock.ev.on(
        "creds.update",
        saveCreds
    );



    sock.ev.on(
        "messages.upsert",
        async ({ messages }) => {


            const msg =
                messages[0];


            if (!msg.message)
                return;



            // Permite o menu acessar os comandos carregados
            msg.commandHandler =
                commandHandler;



            await commandHandler.handle(msg);


        }
    );



    sock.ev.on(
        "connection.update",
        async ({ connection, lastDisconnect }) => {



            if (connection === "open") {

                console.log(
                    "🟢 Bot conectado!"
                );

            }



            if (connection === "close") {


                const status =
                    lastDisconnect?.error instanceof Boom
                    ? lastDisconnect.error.output.statusCode
                    : 0;



                if (
                    status !== DisconnectReason.loggedOut
                ) {


                    console.log(
                        "🔄 Reconectando..."
                    );


                    startBot();


                } else {


                    console.log(
                        "❌ Sessão encerrada."
                    );


                }


            }


        }
    );





    if (!state.creds.registered) {


        rl.question(
            "Digite seu número (ex: 5598999999999): ",

            async numero => {


                const codigo =
                    await sock.requestPairingCode(
                        numero
                    );


                console.log(
                    "\nCódigo:"
                );


                console.log(
                    codigo
                );


                rl.close();


            }
        );


    }


}



startBot();
