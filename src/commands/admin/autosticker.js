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


        const action =
            args[0]?.toLowerCase();


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


        await sock.sendMessage(
            jid,
            {
                text:
                "⚙️ Use:\n\n.autosticker on\n.autosticker off"
            }
        );

    }

};