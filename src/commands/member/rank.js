import {
    flushGroupRankings,
    getGroupRanking
} from "../../services/groupRanking.js";

const MAX_RANK_LIMIT = 30;

function cleanName(value) {
    return String(value || "Usuário")
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || "Usuário";
}

function getLimit(args) {
    if (!args.length) return 10;

    const requested = Number(args[0]);
    if (!Number.isInteger(requested) || requested < 1) return null;
    return Math.min(MAX_RANK_LIMIT, requested);
}

function rankPosition(index) {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return String(index + 1) + ".";
}

function formatMessageTypes(types) {
    const labels = {
        text: "texto",
        image: "imagem",
        video: "vídeo",
        audio: "áudio",
        sticker: "figurinha",
        document: "documento",
        contact: "contato",
        location: "localização",
        reaction: "reação",
        poll: "enquete",
        interactive: "interativo",
        other: "outros"
    };

    return Object.entries(types || {})
        .filter(([, count]) => Number(count) > 0)
        .sort((left, right) => Number(right[1]) - Number(left[1]))
        .map(([type, count]) => `${labels[type] || type}: ${count}`)
        .join(" · ");
}

export default {
    name: "rank",
    aliases: ["ranking"],
    description: "Mostra o ranking de mensagens do grupo",

    async execute(sock, msg, args) {
        const jid = msg.key?.remoteJid;
        if (!jid) return;

        if (!jid.endsWith("@g.us")) {
            await sock.sendMessage(jid, {
                text: "🏆 O comando .rank funciona somente em grupos."
            }, { quoted: msg });
            return;
        }

        const limit = getLimit(args);
        if (limit === null) {
            await sock.sendMessage(jid, {
                text: "🏆 Use .rank para ver o top 10 ou .rank 30 para ver até 30 membros."
            }, { quoted: msg });
            return;
        }

        try {
            await flushGroupRankings();
            const ranking = await getGroupRanking(jid, limit);

            if (!ranking.members.length) {
                await sock.sendMessage(jid, {
                    text: "🏆 *RANKING DO GRUPO*\n\nAinda não tenho mensagens contabilizadas por aqui. A contagem começa automaticamente com as próximas mensagens, sem importar o histórico antigo."
                }, { quoted: msg });
                return;
            }

            const lines = ranking.members.map((member, index) => {
                const position = rankPosition(index);
                const name = member.isBot ? "🤖 Chiru-san Bot" : cleanName(member.name);
                const identity = member.isBot
                    ? "🤖 Chiru-san Bot"
                    : `@${member.id.split("@")[0]}`;
                const types = formatMessageTypes(member.messageTypes);
                const details = [
                    `${member.messages} ${member.messages === 1 ? "mensagem" : "mensagens"}`,
                    `${member.commands} comandos`
                ];
                if (types) details.push(types);

                return `${position} ${identity}\n   ${name} • ${details.join(" • ")}`;
            });

            const groupTypes = formatMessageTypes(ranking.messageTypes);
            const text = [
                `🏆 *RANKING DO GRUPO • TOP ${limit}*`,
                "",
                `💬 Total contabilizado: *${ranking.totalMessages}* mensagens`,
                `👥 Participantes: *${ranking.membersTracked}*`,
                "",
                ...lines,
                ...(groupTypes ? ["", `📊 Tipos no grupo: ${groupTypes}`] : [])
            ].join("\n");

            await sock.sendMessage(jid, {
                text,
                mentions: ranking.members.filter(member => !member.isBot).map(member => member.id)
            }, { quoted: msg });
        } catch (error) {
            console.error("❌ Erro no comando .rank:", error?.message || error);
            await sock.sendMessage(jid, {
                text: "❌ Não consegui carregar o ranking deste grupo agora."
            }, { quoted: msg });
        }
    }
};
