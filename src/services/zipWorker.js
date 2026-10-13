import { Worker } from "node:worker_threads";

/**
 * Executa a compressão ZIP numa worker thread.
 * O socket e a lógica do Baileys continuam na thread principal;
 * somente o trabalho CPU-bound é delegado.
 */
export async function zipStickerFiles(files) {
    const worker = new Worker(
        new URL("../workers/zip.worker.js", import.meta.url)
    );

    return new Promise((resolve, reject) => {
        let settled = false;

        const finish = (error, buffer) => {
            if (settled) return;
            settled = true;

            if (error) reject(error);
            else resolve(Buffer.from(buffer));
        };

        worker.once("message", message => {
            if (!message?.ok) {
                finish(new Error(message?.error || "Falha ao compactar o pack"));
                return;
            }

            finish(null, message.buffer);
        });

        worker.once("error", error => finish(error));

        worker.once("exit", code => {
            if (code !== 0) {
                finish(new Error(`Worker ZIP terminou com código ${code}`));
            }
        });

        try {
            // Transfere os ArrayBuffers em vez de clonar todos os bytes do pack.
            const transferList = Object.values(files)
                .map(([data]) => data?.buffer)
                .filter(buffer => buffer instanceof ArrayBuffer);

            worker.postMessage(files, transferList);
        } catch (error) {
            finish(error);
        }
    }).finally(() => worker.terminate());
}
