// Carrega as variáveis de ambiente ANTES de importar qualquer módulo do bot.
// Isso é importante porque os módulos de IA leem process.env durante a inicialização.
try {
    await import("dotenv/config");
} catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND" || !/dotenv/.test(error.message || "")) {
        throw error;
    }

    // Fallback simples para instalações sem dotenv.
    // Lê o .env da raiz sem sobrescrever variáveis já fornecidas pelo ambiente.
    const { readFile } = await import("node:fs/promises");

    try {
        const envFile = await readFile(new URL("../.env", import.meta.url), "utf8");

        for (const line of envFile.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;

            const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
            if (!match) continue;

            const [, key, rawValue] = match;
            if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;

            let value = rawValue.trim();

            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'")) ||
                (value.startsWith("`") && value.endsWith("`"))
            ) {
                value = value.slice(1, -1);
                if (rawValue.trim().startsWith('"')) {
                    value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
                }
            } else {
                value = value.replace(/\s+#.*$/, "").trim();
            }

            process.env[key] = value;
        }
    } catch (readError) {
        if (readError?.code !== "ENOENT") throw readError;
        console.warn("⚠️ Arquivo .env não encontrado; usando apenas variáveis do ambiente.");
    }
}

console.log(
    process.env.TAVILY_API_KEY?.trim()
        ? "🔎 Tavily: chave carregada no ambiente."
        : "⚠️ Tavily: TAVILY_API_KEY não encontrada no ambiente."
);

// O import dinâmico garante que app.js e todos os seus imports estáticos
// só sejam avaliados depois do carregamento do .env.
await import("./app.js");
