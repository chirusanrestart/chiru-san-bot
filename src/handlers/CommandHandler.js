import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";


export default class CommandHandler {


    constructor(sock) {

        this.sock = sock;
        this.commands = new Map();

    }



    async loadCommands() {


        const folders = [
            "member",
            "admin",
            "owner"
        ];


        for (const folder of folders) {


            const dir =
                path.resolve(
                    `src/commands/${folder}`
                );


            if (!fs.existsSync(dir))
                continue;



            const files =
                fs.readdirSync(dir)
                .filter(
                    file =>
                        file.endsWith(".js")
                );



            for (const file of files) {


                const command =
                    await import(
                        pathToFileURL(
                            `${dir}/${file}`
                        )
                    );



                const cmd =
                    command.default;



                this.commands.set(
                    cmd.name,
                    cmd
                );



                console.log(
                    `📌 Comando carregado: ${cmd.name}`
                );


            }


        }


    }




    async handle(msg) {


        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption;



        if (!text)
            return;



        if (!text.startsWith("."))
            return;



        const args =
            text
                .slice(1)
                .trim()
                .split(/\s+/);



        const commandName =
            args.shift();



        const command =
            this.commands.get(
                commandName
            );



        if (!command)
            return;



        await command.execute(
            this.sock,
            msg,
            args
        );


    }


}
