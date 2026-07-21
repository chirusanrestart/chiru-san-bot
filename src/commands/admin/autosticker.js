import {
    enable,
    disable
} from "../../services/autoSticker.js";


export default {

    name: "autosticker",

    description:
        "Ativa ou desativa o auto-sticker do grupo",


    async execute(sock, msg, args) {

        const jid =
            msg.key.remoteJid;


        // Verifica se é grupo

        if (!jid.endsWith("@g.us")) {

            await sock.sendMessage(
                jid,
                {
                    text:
                    "❌ Este comando só pode ser usado em grupos."
                }
            );

            return;

        }


        // Pega os participantes do grupo

        const metadata =
            await sock.groupMetadata(
                jid
            );


        const participant =
            metadata.participants.find(
                p =>
                    p.id ===
                    msg.key.participant
            );


        // Verifica se é administrador

        const isAdmin =
            participant?.admin === "admin" ||
            participant?.admin === "superadmin";


        if (!isAdmin) {

            await sock.sendMessage(
                jid,
                {
                    text:
                    "❌ Apenas administradores podem usar este comando."
                }
            );

            return;

        }


        // Pega o argumento

        const action =
            args[0]?.toLowerCase();


        // Ativar

        if (action === "on") {

            await enable(
                jid
            );

            await sock.sendMessage(
                jid,
                {
                    text:
                    "🟢 Auto-sticker ativado neste grupo!"
                }
            );

            return;

        }


        // Desativar

        if (action === "off") {

            await disable(
                jid
            );

            await sock.sendMessage(
                jid,
                {
                    text:
                    "🔴 Auto-sticker desativado neste grupo!"
                }
            );

            return;

        }


        // Comando inválido

        await sock.sendMessage(
            jid,
            {
                text:
                "⚙️ Use:\n\n.autosticker on\n.autosticker off"
            }
        );

    }

};
