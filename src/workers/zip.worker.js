import { parentPort } from "node:worker_threads";
import { openSync, closeSync, unlinkSync, writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Zip, ZipPassThrough } from "fflate";

function writeAll(fd, data) {
    let offset = 0;
    while (offset < data.length) {
        const written = writeSync(fd, data, offset, data.length - offset);
        if (written <= 0) throw new Error("Falha ao gravar bloco do ZIP");
        offset += written;
    }
}

parentPort.on("message", files => {
    const filePath = path.join(
        os.tmpdir(),
        `chiru-sticker-pack-${randomUUID()}.zip`
    );

    let fd;
    let fileLength = 0;
    let writeError = null;

    try {
        fd = openSync(filePath, "wx");

        const zip = new Zip((error, data) => {
            if (error) {
                writeError = error;
                return;
            }
            if (data?.length) {
                writeAll(fd, data);
                fileLength += data.length;
            }
        });

        for (const [fileName, entry] of Object.entries(files)) {
            const data = Array.isArray(entry) ? entry[0] : entry;
            if (!(data instanceof Uint8Array)) {
                throw new TypeError(`Dados inválidos para ${fileName}`);
            }

            // ZipPassThrough preserva os bytes originais, como level: 0 no ZIP anterior.
            const stream = new ZipPassThrough(fileName);
            zip.add(stream);
            stream.push(data, true);

            if (writeError) throw writeError;
        }

        zip.end();
        if (writeError) throw writeError;

        closeSync(fd);
        fd = null;
        parentPort.postMessage({
            ok: true,
            filePath,
            fileLength
        });
    } catch (error) {
        if (fd !== null && fd !== undefined) {
            try { closeSync(fd); } catch {}
        }
        try { unlinkSync(filePath); } catch {}
        parentPort.postMessage({
            ok: false,
            error: error?.message || String(error)
        });
    }
});
