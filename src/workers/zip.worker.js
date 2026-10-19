import { parentPort } from "node:worker_threads";
import { zipSync } from "fflate";

parentPort.on("message", files => {
    try {
        // ZIP é CPU-bound: mantenha a compressão fora da thread principal.
        const zipped = zipSync(files);

        // Transfer the ZIP's backing store directly when it contains only
        // the ZIP bytes. Slice only for views into a larger backing store.
        const exactBacking =
            zipped.byteOffset === 0 &&
            zipped.byteLength === zipped.buffer.byteLength;
        const transferable = exactBacking
            ? zipped.buffer
            : zipped.buffer.slice(
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
