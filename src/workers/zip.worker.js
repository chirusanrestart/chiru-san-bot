import { parentPort } from "node:worker_threads";
import { zipSync } from "fflate";

parentPort.on("message", files => {
    try {
        // ZIP é CPU-bound: mantenha a compressão fora da thread principal.
        const zipped = zipSync(files);
        const transferable = zipped.buffer.slice(
            zipped.byteOffset,
            zipped.byteOffset + zipped.byteLength
        );

        parentPort.postMessage(
            { ok: true, buffer: transferable },
            [transferable]
        );
    } catch (error) {
        parentPort.postMessage({
            ok: false,
            error: error?.message || String(error)
        });
    }
});
