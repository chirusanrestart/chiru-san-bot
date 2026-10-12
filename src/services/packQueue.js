import { randomUUID } from "node:crypto";

/**
 * Fila FIFO de packs.
 * Um único worker executa um pack por vez para evitar jobs concorrentes
 * disputando o socket, FFmpeg e arquivos temporários.
 *
 * Esta fila vive na memória do processo: reiniciar o bot descarta os pendentes.
 */
const queue = [];
let running = false;
let currentJob = null;
let completed = 0;
let failed = 0;

function snapshot() {
    return {
        pending: queue.length,
        running: currentJob ? 1 : 0,
        completed,
        failed
    };
}

async function drainQueue() {
    if (running) return;
    running = true;

    try {
        while (queue.length > 0) {
            const job = queue.shift();
            currentJob = job;
            job.startedAt = Date.now();

            console.log(
                `📦 [pack ${job.id}] Iniciando. Pendentes: ${queue.length}`
            );

            try {
                await job.task({
                    id: job.id,
                    queuedAt: job.queuedAt,
                    startedAt: job.startedAt
                });
                completed++;
            } catch (error) {
                failed++;
                console.error(`❌ [pack ${job.id}] Falha não tratada:`, error);

                try {
                    await job.onError?.(error, { id: job.id });
                } catch (handlerError) {
                    console.error(`❌ [pack ${job.id}] Falha no handler de erro:`, handlerError);
                }
            } finally {
                console.log(
                    `🏁 [pack ${job.id}] Finalizado em ${Date.now() - job.startedAt}ms. ${JSON.stringify(snapshot())}`
                );
                currentJob = null;
            }
        }
    } finally {
        running = false;

        // Evita deixar jobs presos caso um novo pedido chegue no limite do worker.
        if (queue.length > 0) {
            void drainQueue();
        }
    }
}

export async function enqueuePack(task, options = {}) {
    if (typeof task !== "function") {
        throw new TypeError("enqueuePack espera uma função");
    }

    const job = {
        id: randomUUID().slice(0, 8),
        task,
        onError: options.onError,
        queuedAt: Date.now(),
        startedAt: null
    };

    queue.push(job);
    const position = queue.length + (currentJob ? 1 : 0);

    console.log(
        `📥 [pack ${job.id}] Na fila, posição ${position}. ${JSON.stringify(snapshot())}`
    );

    // Avisa primeiro quem pediu. Mesmo se o envio do aviso falhar, o job é mantido.
    try {
        await options.onQueued?.({ id: job.id, position });
    } catch (error) {
        console.error(`⚠️ [pack ${job.id}] Não consegui enviar confirmação da fila:`, error);
    }

    // Não aguarda o processamento: o handler do WhatsApp fica livre.
    void drainQueue();

    return {
        id: job.id,
        position,
        queuedAt: job.queuedAt
    };
}

export function getPackQueueStatus() {
    return snapshot();
}
