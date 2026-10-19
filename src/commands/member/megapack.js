import { getMegapackHistory } from "../../services/megapackHistory.js";
import { getPackQueueStatus } from "../../services/packQueue.js";
import packCommand from "./pack.js";

export default {
    name: "megapack",
    aliases: ["restaurarpack", "packbackup"],
    description: "Recoloca na fila todos os packs já pedidos ao bot",
    async execute(sock, msg) {
        const from = msg.key.remoteJid;
        let packs;

        try {
            packs = await getMegapackHistory();
        } catch (error) {
            console.error("❌ Erro lendo histórico global do megapack:", error);
            return sock.sendMessage(from, {
                text: "❌ Não consegui ler o catálogo de packs agora. Tenta novamente daqui a pouquinho."
            }, { quoted: msg });
        }

        const names = [...new Set(packs.map(item => String(item.name || "").trim()).filter(Boolean))];
        if (!names.length) {
            return sock.sendMessage(from, {
                text: "🌸 Ainda não há packs no catálogo. A partir dos pedidos feitos com *.pack nome do personagem*, o bot vai guardar os nomes automaticamente para todo mundo."
            }, { quoted: msg });
        }

        await sock.sendMessage(from, {
            text: `💖 O catálogo global tem *${names.length}* personagens! Vou colocar todos os packs na fila para você.\n\n${names.map((name, i) => `${i + 1}. ${name}`).join("\n")}\n\n📥 Pode demorar um pouquinho porque cada pack é gerado normalmente.`
        }, { quoted: msg });

        // Uma única mensagem editável acompanha o lote inteiro.
        const initialStatus = await sock.sendMessage(from, {
            text: `⏳ Preparando o megapack...\\n📦 Packs concluídos: 0/${names.length}`
        }, { quoted: msg });

        let statusChain = Promise.resolve();
        let lastStatusText = "";
        msg.packBatch = {
            remaining: names.length,
            total: names.length,
            failed: false,
            finalized: false,
            initializing: true,
            statusMessageKey: initialStatus?.key || null,
            updateStatus: () => {
                if (msg.packBatch.initializing) return Promise.resolve();

                statusChain = statusChain.then(async () => {
                    const batch = msg.packBatch;
                    const done = batch.total - batch.remaining;
                    let text;

                    if (batch.finalized || batch.remaining === 0) {
                        text = batch.failed
                            ? `❌ Megapack finalizado com falhas.\\n📦 Packs processados: ${done}/${batch.total}`
                            : `✅ Megapack concluído!\\n📦 Packs processados: ${done}/${batch.total}`;
                    } else {
                        const queue = getPackQueueStatus();
                        text = `⏳ Megapack em andamento\\n📦 Packs processados: ${done}/${batch.total}\\n⚙️ Packs em processamento: ${queue.running}\\n🕒 Packs aguardando na fila: ${queue.pending}`;
                    }

                    if (text === lastStatusText) return;

                    if (batch.statusMessageKey) {
                        await sock.sendMessage(from, {
                            text,
                            edit: batch.statusMessageKey
                        });
                    }

                    lastStatusText = text;
                }).catch(error => {
                    console.error("⚠️ Não consegui editar o status do megapack:", error);
                });

                return statusChain;
            }
        };

        await sock.sendMessage(from, {
            react: { text: "⏳", key: msg.key }
        });

        for (const name of names) {
            try {
                await packCommand.execute(sock, msg, [name]);
            } catch (error) {
                msg.packBatch.failed = true;
                msg.packBatch.remaining -= 1;
                console.error(`❌ Falha ao enfileirar o pack "${name}" no megapack:`, error);
            }
        }

        msg.packBatch.initializing = false;

        // Atualiza uma vez depois de enfileirar o lote, evitando dezenas de edições
        // durante a preparação inicial.
        if (msg.packBatch.remaining === 0 && !msg.packBatch.finalized) {
            msg.packBatch.finalized = true;
            const emoji = msg.packBatch.failed ? "❌" : "✅";
            await msg.packBatch.updateStatus();
            await sock.sendMessage(from, {
                react: { text: emoji, key: msg.key }
            });
        } else {
            await msg.packBatch.updateStatus();
        }
    }
};
