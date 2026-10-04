import { listMasterGooglePhotos } from "../../services/googlePhotosMaster.js";

export default {
    name: "list",

    aliases: ["packs", "packslist"],

    description: "Lista os personagens disponíveis no álbum mestre do Google Fotos",

    async execute(sock, msg) {
        const from = msg.key.remoteJid;

        try {
            const names =
                await listMasterGooglePhotos();

            if (!names.length) {
                await sock.sendMessage(
                    from,
                    {
                        text:
                            "📦 Nenhum pack foi encontrado no álbum mestre do Google Fotos."
                    },
                    {
                        quoted: msg
                    }
                );

                return;
            }

            const lines =
                names.map(
                    (name, index) =>
                        (index + 1) +
                        ". " +
                        name
                );

            await sock.sendMessage(
                from,
                {
                    text:
                        "📦 *Packs disponíveis no álbum mestre*\n\n" +
                        lines.join("\n") +
                        "\n\n✨ Total: *" +
                        names.length +
                        "* personagens\n" +
                        "Use *.pack nome do personagem* para montar o pack."
                },
                {
                    quoted: msg
                }
            );
        } catch (err) {
            console.error(
                "list error:",
                err
            );

            await sock.sendMessage(
                from,
                {
                    text:
                        "❌ Não consegui ler o álbum mestre: " +
                        err.message
                },
                {
                    quoted: msg
                }
            );
        }
    }
};
