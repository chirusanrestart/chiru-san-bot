import { Worker } from "node:worker_threads";

/**
 * Cria o ZIP em disco dentro da worker thread.
 * A thread principal recebe apenas o caminho e o tamanho do arquivo final.
 */
export async function zipStickerFiles(files) {
    const worker = new Worker(
        new URL("../workers/zip.worker.js", import.meta.url)
    );

    return new Promise((resolve, reject) => {
        let settled = false;

        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            if (error) reject(error);
            else resolve(result);
        };

        worker.once("message", message => {
            if (!message?.ok) {
                finish(new Error(message?.error || "Falha ao compactar o pack"));
                return;
            }
            finish(null, {
                filePath: message.filePath,
                fileLength: message.fileLength
            });
        });

        worker.once("error", error => finish(error));
        worker.once("exit", code => {
            if (code !== 0) finish(new Error(`Worker ZIP terminou com código ${code}`));
        });

        try {
            const transferList = [
                ...new Set(
                    Object.values(files)
                        .map(([data]) => data?.buffer)
                        .filter(buffer => buffer instanceof ArrayBuffer)
                )
            ];
            worker.postMessage(files, transferList);
        } catch (error) {
            finish(error);
        }
    }).finally(() => worker.terminate());
}
