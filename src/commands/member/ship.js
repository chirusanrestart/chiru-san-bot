function normalizeName(value) {
    return String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("pt-BR");
}

function hashPair(nameA, nameB) {
    const pair = [normalizeName(nameA), normalizeName(nameB)]
        .sort()
        .join(" ♥ ");

    let hash = 0x811c9dc5;
    for (const character of pair) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0) % 101;
}

function getShipResult(score) {
    if (score >= 95) {
        return {
            title: "SHIP LENDÁRIO",
            phrase: "O roteiro já está pronto. Só falta o episódio de estreia! 💍",
            emoji: "💎"
        };
    }
    if (score >= 80) {
        return {
            title: "QUÍMICA ABSURDA",
            phrase: "Tem sintonia, tem conexão e tem torcida! 💗",
            emoji: "💞"
        };
    }
    if (score >= 65) {
        return {
            title: "SHIP PROMISSOR",
            phrase: "Tem potencial para virar aquele casal favorito. 🌷",
            emoji: "🌸"
        };
    }
    if (score >= 45) {
        return {
            title: "VAI QUE...",
            phrase: "O destino deixou a porta entreaberta. 👀",
            emoji: "✨"
        };
    }
    if (score >= 25) {
        return {
            title: "DUO IMPROVÁVEL",
            phrase: "Talvez funcione melhor como dupla de aventuras. 🎮",
            emoji: "⭐"
        };
    }
    return {
        title: "O ROTEIRISTA NEGOU",
        phrase: "Por enquanto, o universo escreveu outro enredo. 😂",
        emoji: "🌀"
    };
}

export default {
    name: "ship",
    aliases: ["casal", "shippar"],
    description: "Calcula a compatibilidade divertida entre duas pessoas",

    async execute(sock, msg, args) {
        const jid = msg.key?.remoteJid;
        if (!jid) return;

        try {
            const context = msg.message?.extendedTextMessage?.contextInfo;
            const mentioned = Array.isArray(context?.mentionedJid)
                ? context.mentionedJid.filter(Boolean).slice(0, 2)
                : [];

            let personA;
            let personB;
            let displayA;
            let displayB;

            if (mentioned.length >= 2) {
                personA = mentioned[0];
                personB = mentioned[1];
                displayA = `@${personA.split("@")[0]}`;
                displayB = `@${personB.split("@")[0]}`;
            } else if (args.length >= 2) {
                displayA = args[0].trim();
                displayB = args.slice(1).join(" ").trim();
                personA = displayA;
                personB = displayB;
            } else {
                await sock.sendMessage(jid, {
                    text: [
                        "╭─── 💘 *CHIRU SHIP METER*",
                        "│",
                        "│  Descubra a compatibilidade",
                        "│  de duas pessoas!",
                        "│",
                        "│  *Como usar:*",
                        "│  • .ship Nome1 Nome2",
                        "│  • .ship @pessoa1 @pessoa2",
                        "│",
                        "╰────────────── 🌸"
                    ].join("\n")
                }, { quoted: msg });
                return;
            }

            if (!normalizeName(displayA) || !normalizeName(displayB)) {
                await sock.sendMessage(jid, {
                    text: "💗 Preciso de dois nomes para calcular o ship!"
                }, { quoted: msg });
                return;
            }

            const score = hashPair(personA, personB);
            const result = getShipResult(score);
            const filled = Math.round(score / 10);
            const bar = "▰".repeat(filled) + "▱".repeat(10 - filled);
            const mentions = mentioned.length >= 2 ? mentioned : [];

            const response = [
                "╭━━━〔 💘 *CHIRU SHIP METER* 〕━━━╮",
                "┃",
                `┃  👤 ${displayA}`,
                "┃          💗",
                `┃  👤 ${displayB}`,
                "┃",
                "┣━━━━━━━━━━━━━━━━━━━━",
                `┃  ${result.emoji} *COMPATIBILIDADE*`,
                `┃  *${score}%*  ${bar}`,
                "┃",
                `┃  ✨ *${result.title}*`,
                `┃  ${result.phrase}`,
                "┃",
                "┣━━━━━━━━━━━━━━━━━━━━",
                "┃  🔮 Resultado recreativo",
                "┃  💌 O destino do ship é uma",
                "┃     brincadeira do Chiru-san!",
                "╰━━━━━━━━━━━━━━━━━━━━ 🌸"
            ].join("\n");

            await sock.sendMessage(jid, {
                text: response,
                ...(mentions.length ? { mentions } : {})
            }, { quoted: msg });
        } catch (error) {
            console.error("Erro no ship:", error);
            await sock.sendMessage(jid, {
                text: "❌ Não consegui calcular esse ship agora. Tenta mais uma vez daqui a pouquinho!"
            }, { quoted: msg });
        }
    }
};
