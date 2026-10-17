function formatDuration(seconds) {
    const total = Math.floor(seconds);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours || days) parts.push(`${hours}h`);
    if (minutes || hours || days) parts.push(`${minutes}min`);
    parts.push(`${secs}s`);
    return parts.join(" ");
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "indisponível";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function serviceStatus(variableNames) {
    const configured = variableNames.some(name =>
        typeof process.env[name] === "string" &&
        process.env[name].trim().length > 0
    );

    return configured
        ? "🟢 Configurado (conectividade não testada)"
        : "🔴 Desativado: chave não configurada";
}

export default {
    name: "status",
    description: "Mostra o estado do bot e dos serviços",

    async execute(sock, msg) {
        const jid = msg.key?.remoteJid;
        if (!jid) return;

        const memory = process.memoryUsage();
        const connected = Boolean(sock.user?.id);
        const connectionText = connected
            ? "🟢 Conectado ao WhatsApp"
            : "🟠 Conexão não confirmada / reconectando";

        const lines = [
            "🌸 *STATUS • CHIRU SAN BOT*",
            "",
            `📡 *WhatsApp:* ${connectionText}`,
            `⏱️ *Tempo ativo:* ${formatDuration(process.uptime())}`,
            "",
            "🧠 *Memória do Node.js*",
            `• Heap usado: ${formatBytes(memory.heapUsed)} / ${formatBytes(memory.heapTotal)}`,
            `• RSS (processo): ${formatBytes(memory.rss)}`,
            `• Memória externa: ${formatBytes(memory.external)}`,
            "",
            "🧩 *Serviços*",
            `• IA (provedores): ${serviceStatus(["GROQ_API_KEY", "PORTKEY_API_KEY"])}`,
            `• Pesquisa web Tavily: ${serviceStatus(["TAVILY_API_KEY"])}`,
            "",
            "ℹ️ *Nota:* 'Configurado' confirma apenas a presença da variável, não que a API esteja respondendo. Chaves e dados privados não são exibidos."
        ];

        try {
            await sock.sendMessage(jid, { text: lines.join("\n") }, { quoted: msg });
        } catch (error) {
            console.error("Erro no comando status:", error?.message || error);
        }
    }
};
