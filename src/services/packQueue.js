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

function notifyQueueChanges() {
    const updates = [];

    if (currentJob?.onQueueUpdate) {
        updates.push({
            job: currentJob,
            state: "running",
            position: 0
        });
    }

    queue.forEach((job, index) => {
        if (job.onQueueUpdate) {
            updates.push({
                job,
                state: "queued",
                position: index + (currentJob ? 2 : 1)
            });
        }
    });

    for (const update of updates) {
        try {
            Promise.resolve(update.job.onQueueUpdate({
                id: update.job.id,
                state: update.state,
                position: update.position,
                ...snapshot()
            })).catch(error => {
                console.error(`⚠️ [pack ${update.job.id}] Falha ao atualizar status da fila:`, error);
            });
        } catch (error) {
            console.error(`⚠️ [pack ${update.job.id}] Falha ao atualizar status da fila:`, error);
        }
    }
}

async function drainQueue() {
    if (running) return;
    running = true;

    try {
        while (queue.length > 0 && queue[0].ready) {
            const job = queue.shift();
            currentJob = job;
            job.startedAt = Date.now();

            notifyQueueChanges();
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
                job.resolveCompletion({ success: true, id: job.id });
            } catch (error) {
                failed++;
                job.resolveCompletion({ success: false, id: job.id, error });
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
                notifyQueueChanges();
            }
        }
    } finally {
        running = false;

        // Evita deixar jobs presos caso um novo pedido chegue no limite do worker.
        if (queue.length > 0 && queue[0].ready) {
            void drainQueue();
        }
    }
}

export async function enqueuePack(task, options = {}) {
    if (typeof task !== "function") {
        throw new TypeError("enqueuePack espera uma função");
    }

    let resolveCompletion;
    const completion = new Promise(resolve => { resolveCompletion = resolve; });

    const job = {
        id: randomUUID().slice(0, 8),
        task,
        completion,
        resolveCompletion,
        onError: options.onError,
        onQueued: options.onQueued,
        onQueueUpdate: options.onQueueUpdate,
        ready: false,
        queuedAt: Date.now(),
        startedAt: null
    };

    queue.push(job);
    const position = queue.length + (currentJob ? 1 : 0);

    console.log(
        `📥 [pack ${job.id}] Na fila, posição ${position}. ${JSON.stringify(snapshot())}`
    );

    // Cria a mensagem inicial antes de iniciar o worker, para que as edições
    // posteriores sempre tenham a chave da mensagem que precisam editar.
    try {
        await job.onQueued?.({ id: job.id, position, ...snapshot() });
    } catch (error) {
        console.error(`⚠️ [pack ${job.id}] Não consegui enviar a confirmação inicial da fila:`, error);
    }

    job.ready = true;
    notifyQueueChanges();

    // Só começa quando a mensagem inicial já foi criada, evitando condições de corrida.
    void drainQueue();

    const queuedResult = { id: job.id, position, queuedAt: job.queuedAt };
    if (options.awaitCompletion) return await job.completion;
    return queuedResult;
}

export function getPackQueueStatus() {
    return snapshot();
}
