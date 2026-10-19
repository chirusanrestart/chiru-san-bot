import { Worker } from "node:worker_threads";

function buildCatalogInWorker() {
    return new Promise((resolve, reject) => {
        const worker = new Worker(
            new URL("../../workers/megapacklista.worker.js", import.meta.url),
            { type: "module" }
        );

        let settled = false;

        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            callback(value);
        };

        worker.once("message", result => {
            if (result?.ok) {
                finish(resolve, result);
            } else {
                finish(reject, new Error(result?.error || "O worker não conseguiu preparar o catálogo."));
            }
            void worker.terminate();
        });

        worker.once("error", error => {
            finish(reject, error);
            void worker.terminate();
        });

        worker.once("exit", code => {
            if (code !== 0) {
                finish(reject, new Error(`O worker do megapack terminou com código ${code}.`));
            }
        });
    });
}

export default {
    name: "megapacklista",
    aliases: ["listamegapack", "megapacklist"],
    description: "Lista todos os personagens salvos no catálogo do megapack usando uma thread separada",
    async execute(sock, msg) {
        const from = msg.key.remoteJid;

        let result;
        try {
            result = await buildCatalogInWorker();
        } catch (error) {
            console.error("❌ Erro no worker do catálogo do megapack:", error);
            return sock.sendMessage(from, {
                text: "❌ Não consegui preparar a lista do megapack agora. Tenta novamente daqui a pouquinho."
            }, { quoted: msg });
        }

        if (!result.count) {
            return sock.sendMessage(from, {
                text: "🌸 O catálogo do megapack ainda está vazio. Os nomes vão sendo salvos quando alguém usa *.pack nome do personagem* e quando a varredura encontra comandos antigos."
            }, { quoted: msg });
        }

        try {
            await sock.sendMessage(from, { text: result.text }, { quoted: msg });
        } catch (error) {
            console.error("❌ Erro enviando catálogo completo do megapack:", error);
            await sock.sendMessage(from, {
                text: `❌ Não consegui enviar a lista completa em uma única mensagem. O catálogo tem ${result.count} personagens e a mensagem pode ter ultrapassado o limite aceito pelo WhatsApp.`
            }, { quoted: msg });
        }
    }
};
