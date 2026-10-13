import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const TIMEOUT_MS = 3500;

const STATUS = {
    ok: "✅",
    warn: "⚠️",
    fail: "❌"
};

function result(status, label, detail) {
    return { status, label, detail };
}

async function withTimeout(promise, ms = TIMEOUT_MS) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("tempo esgotado")), ms);
                timer.unref?.();
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function checkFile(file, label = file) {
    try {
        await fs.access(path.resolve(ROOT, file));
        return result("ok", label, "arquivo encontrado");
    } catch {
        return result("fail", label, "arquivo ausente");
    }
}

function checkEnv(names, label, required = false) {
    const configured = names.some(name =>
        typeof process.env[name] === "string" &&
        process.env[name].trim().length > 0
    );

    if (configured) {
        return result("ok", label, "configuração presente (valor oculto)");
    }

    return result(
        required ? "fail" : "warn",
        label,
        required ? "configuração necessária não encontrada" : "não configurado"
    );
}

async function checkPackage(packageName) {
    try {
        await import.meta.resolve(packageName);
        return result("ok", `Dependência ${packageName}`, "resolução do módulo OK");
    } catch {
        return result("fail", `Dependência ${packageName}`, "módulo não encontrado; verifique npm install");
    }
}

function checkBinary(binary, args, label) {
    return new Promise(resolve => {
        let settled = false;
        let child;

        const finish = value => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { child?.kill("SIGKILL"); } catch {}
            resolve(value);
        };

        const timer = setTimeout(() => {
            finish(result("warn", label, "verificação excedeu o tempo limite"));
        }, TIMEOUT_MS);
        timer.unref?.();

        try {
            child = spawn(binary, args, {
                stdio: ["ignore", "pipe", "ignore"],
                windowsHide: true
            });

            let output = "";
            child.stdout?.on("data", chunk => {
                if (output.length < 200) output += chunk.toString();
            });

            child.once("error", error => {
                finish(result(
                    "warn",
                    label,
                    error.code === "ENOENT"
                        ? "ferramenta não encontrada no PATH"
                        : "não foi possível executar a ferramenta"
                ));
            });

            child.once("close", code => {
                if (code === 0) {
                    const version = output.trim().split(/\r?\n/)[0];
                    finish(result("ok", label, version ? `disponível: ${version.slice(0, 100)}` : "disponível"));
                } else {
                    finish(result("warn", label, `comando terminou com código ${code ?? "desconhecido"}`));
                }
            });
        } catch {
            finish(result("warn", label, "não foi possível iniciar a verificação"));
        }
    });
}

async function checkHost(url, label) {
    try {
        const response = await withTimeout(fetch(url, {
            method: "HEAD",
            signal: AbortSignal.timeout(TIMEOUT_MS)
        }), TIMEOUT_MS);

        // A resposta HTTP, inclusive 401/403/404, confirma conectividade com o host.
        return result("ok", label, `host acessível (HTTP ${response.status})`);
    } catch (error) {
        const reason = error?.name === "TimeoutError" || error?.name === "AbortError"
            ? "tempo limite de conexão"
            : "host inacessível ou conexão bloqueada";
        return result("warn", label, reason);
    }
}

function formatReport(items) {
    const lines = items.map(item =>
        `${STATUS[item.status]} ${item.label}: ${item.detail}`
    );

    const failures = items.filter(item => item.status === "fail").length;
    const warnings = items.filter(item => item.status === "warn").length;
    const headline = failures
        ? "❌ Diagnóstico concluído: há falha(s) que precisam de atenção."
        : warnings
            ? "⚠️ Diagnóstico concluído com avisos."
            : "✅ Diagnóstico concluído sem problemas detectados.";

    return [
        "🩺 *Diagnóstico do Chiru-san Bot*",
        "",
        ...lines,
        "",
        headline,
        `Resumo: ${items.length - failures - warnings} OK • ${warnings} aviso(s) • ${failures} falha(s)`,
        "",
        "_Verificações leves; nenhuma configuração foi alterada._"
    ].join("\n");
}

export default {
    name: "diagnostico",
    aliases: [],
    description: "Verifica configurações, dependências e serviços do bot",

    async execute(sock, msg) {
        const jid = msg.key?.remoteJid;
        if (!jid) return;

        await sock.sendMessage(jid, {
            text: "🩺 Vou fazer um check-up rapidinho no Chiru-san Bot..."
        });

        const items = [];

        try {
            // Dependências realmente declaradas pelo projeto e usadas na inicialização.
            for (const pkg of [
                "@whiskeysockets/baileys",
                "@hapi/boom",
                "pino",
                "dotenv",
                "axios",
                "groq-sdk"
            ]) {
                items.push(await checkPackage(pkg));
            }

            items.push(await checkFile("package.json", "package.json"));
            items.push(await checkFile("src/app.js", "Inicializador src/app.js"));
            items.push(await checkFile("src/handlers/CommandHandler.js", "Carregador de comandos"));
            try {
                await fs.access(path.resolve(ROOT, ".env"));
                items.push(result("ok", "Arquivo .env", "arquivo encontrado; conteúdo não é exibido"));
            } catch {
                items.push(result(
                    "warn",
                    "Arquivo .env",
                    "não encontrado; as variáveis podem ter sido definidas no ambiente do processo"
                ));
            }

            items.push(checkEnv(["GROQ_API_KEY"], "Chave da IA Groq", true));
            items.push(checkEnv(["TAVILY_API_KEY"], "Chave da pesquisa Tavily"));
            items.push(checkEnv(
                ["WEBFETCH_API_KEY", "WEBFETCH_KEY", "SCRAPER_API_KEY"],
                "Chave de scraper (nomes reconhecidos)"
            ));

            // Ferramentas usadas por funcionalidades de mídia do projeto.
            items.push(await checkBinary("ffmpeg", ["-version"], "FFmpeg"));
            items.push(await checkBinary("yt-dlp", ["--version"], "yt-dlp"));

            // Testa somente conectividade HTTP HEAD, sem autenticação ou chamadas pagas de API.
            items.push(await checkHost("https://api.groq.com", "Conectividade com Groq"));
            items.push(await checkHost("https://api.tavily.com", "Conectividade com Tavily"));

            const report = formatReport(items);
            await sock.sendMessage(jid, { text: report });
        } catch (error) {
            console.error("Erro interno no comando .diagnostico:", error?.message || error);
            await sock.sendMessage(jid, {
                text: "⚠️ O diagnóstico foi interrompido por um erro interno. Confira o terminal do bot para detalhes."
            });
        }
    }
};
