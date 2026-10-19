import { getMegapackHistory } from "../../services/megapackHistory.js";
import { getPackQueueStatus } from "../../services/packQueue.js";
import packCommand from "./pack.js";

function getCatalogNames(packs) {
    const unique = new Map();

    for (const item of packs || []) {
        const name = String(item?.name || "").trim();
        if (!name) continue;

        const key = name.toLocaleLowerCase("pt-BR");
        if (!unique.has(key)) unique.set(key, name);
    }

    return [...unique.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export default {
    name: "megapack",
    aliases: ["restaurarpack", "packbackup"],
    description: "Restaura todos os packs salvos ou envia somente o pack indicado pelo número da megapacklista",
    async execute(sock, msg, args = []) {
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

        const names = getCatalogNames(packs);
        if (!names.length) {
            return sock.sendMessage(from, {
                text: "🌸 Ainda não há packs no catálogo. A partir dos pedidos feitos com *.pack nome do personagem*, o bot vai guardar os nomes automaticamente para todo mundo."
            }, { quoted: msg });
        }

        // Com um número, usa exatamente a mesma ordenação e numeração de .megapacklista.
        // O comando .megapack sem argumentos mantém o comportamento original: restaurar tudo.
        if (args.length > 0) {
            const rawIndex = String(args[0] || "").trim();
            if (!/^\d+$/.test(rawIndex) || args.length > 1) {
                return sock.sendMessage(from, {
                    text: "🌸 Use *.megapack número* para enviar um único pack, por exemplo *.megapack 90*.\nPara restaurar todos os packs, use *.megapack*."
                }, { quoted: msg });
            }

            const index = Number(rawIndex);
            if (!Number.isSafeInteger(index) || index < 1 || index > names.length) {
                return sock.sendMessage(from, {
                    text: `❌ O número *${rawIndex}* não existe no catálogo. Use *.megapacklista* para conferir os números de 1 a ${names.length}.`
                }, { quoted: msg });
            }

            const name = names[index - 1];
            const queue = getPackQueueStatus();
            await sock.sendMessage(from, {
                text: `📦 Você escolheu o pack *#${index}: ${name}*.\n🌸 Vou gerar somente esse pack.\n📍 Itens aguardando na fila: ${queue.pending}.`
            }, { quoted: msg });

            return packCommand.execute(sock, msg, [name]);
        }

        await sock.sendMessage(from, {
            text: `💖 O catálogo global tem *${names.length}* personagens! Vou colocar todos os packs na fila para você.\n\n${names.map((name, i) => `${i + 1}. ${name}`).join("\n")}\n\n📥 Pode demorar um pouquinho porque cada pack é gerado normalmente.`
        }, { quoted: msg });

        // Uma única mensagem editável acompanha o lote inteiro.
        const initialStatus = await sock.sendMessage(from, {
            text: `⏳ Preparando o megapack...\n📦 Packs concluídos: 0/${names.length}`
        }, { quoted: msg });

        let statusChain = Promise.resolve();
        let lastStatusText = "";
        msg.packBatch = {
            remaining: names.length,
            total: names.length,
            failed: false,
            finalized: false,
            initializing: true,
            sequential: true,
            statusMessageKey: initialStatus?.key || null,
            updateStatus: () => {
                if (msg.packBatch.initializing) return Promise.resolve();

                statusChain = statusChain.then(async () => {
                    const batch = msg.packBatch;
                    const done = batch.total - batch.remaining;
                    let text;

                    if (batch.finalized || batch.remaining === 0) {
                        text = batch.failed
                            ? `❌ Megapack finalizado com falhas.\n📦 Packs processados: ${done}/${batch.total}`
                            : `✅ Megapack concluído!\n📦 Packs processados: ${done}/${batch.total}`;
                    } else {
                        const queue = getPackQueueStatus();
                        text = `⏳ Megapack em andamento\n📦 Packs processados: ${done}/${batch.total}\n⚙️ Fila global em processamento: ${queue.running}\n🕒 Na fila global: ${queue.pending}`;
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

        // O lote agora é sequencial, então o status precisa atualizar durante cada pack.
        msg.packBatch.initializing = false;

        for (const name of names) {
            try {
                // Aguarda cada pack terminar antes de iniciar o próximo.
                await packCommand.execute(sock, msg, [name]);
            } catch (error) {
                msg.packBatch.failed = true;
                msg.packBatch.remaining = Math.max(0, msg.packBatch.remaining - 1);
                console.error(`❌ Falha ao processar o pack "${name}" no megapack:`, error);
            }
            // Cede o event loop entre tarefas pesadas.
            await new Promise(resolve => setImmediate(resolve));
        }

        msg.packBatch.initializing = false;

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
