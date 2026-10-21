import { parentPort } from "node:worker_threads";
import { openSync, closeSync, unlinkSync, writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

// WhatsApp sticker packs are ZIP archives. Write a classic, uncompressed ZIP
// with explicit sizes and CRCs in each local header. Avoid data descriptors,
// which some sticker-pack readers handle less reliably than regular ZIP entries.
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    CRC_TABLE[n] = value >>> 0;
}

function crc32(data) {
    let value = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        value = CRC_TABLE[(value ^ data[i]) & 0xff] ^ (value >>> 8);
    }
    return (value ^ 0xffffffff) >>> 0;
}

function writeAll(fd, data) {
    let offset = 0;
    while (offset < data.length) {
        const written = writeSync(fd, data, offset, data.length - offset);
        if (written <= 0) throw new Error("Falha ao gravar bloco do ZIP");
        offset += written;
    }
}

function makeLocalHeader(nameLength, crc, size) {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // UTF-8 filename, no data descriptor
    header.writeUInt16LE(0, 8); // stored, no compression
    header.writeUInt16LE(0, 10); // DOS time
    header.writeUInt16LE(0, 12); // DOS date
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(size, 18);
    header.writeUInt32LE(size, 22);
    header.writeUInt16LE(nameLength, 26);
    header.writeUInt16LE(0, 28);
    return header;
}

function makeCentralHeader(nameLength, crc, size, localOffset) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4); // version made by
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(0x0800, 8); // UTF-8 filename
    header.writeUInt16LE(0, 10); // stored, no compression
    header.writeUInt16LE(0, 12); // DOS time
    header.writeUInt16LE(0, 14); // DOS date
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(size, 20);
    header.writeUInt32LE(size, 24);
    header.writeUInt16LE(nameLength, 28);
    header.writeUInt16LE(0, 30); // extra length
    header.writeUInt16LE(0, 32); // comment length
    header.writeUInt16LE(0, 34); // disk number
    header.writeUInt16LE(0, 36); // internal attributes
    header.writeUInt32LE(0, 38); // external attributes
    header.writeUInt32LE(localOffset, 42);
    return header;
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
        const entries = Object.entries(files);
        if (entries.length === 0) throw new Error("O ZIP não contém figurinhas");
        if (entries.length > 0xffff) throw new Error("Quantidade de arquivos excede o limite ZIP");

        fd = openSync(filePath, "wx");
        const centralParts = [];
        let offset = 0;

        for (const [fileName, entry] of entries) {
            const data = Array.isArray(entry) ? entry[0] : entry;
            if (!(data instanceof Uint8Array)) {
                throw new TypeError(`Dados inválidos para ${fileName}`);
            }

            const name = Buffer.from(fileName, "utf8");
            const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
            const size = bytes.length;
            if (size > 0xffffffff || offset > 0xffffffff) {
                throw new Error("Arquivo excede o limite ZIP32");
            }

            const crc = crc32(bytes);
            writeAll(fd, makeLocalHeader(name.length, crc, size));
            writeAll(fd, name);
            writeAll(fd, bytes);

            centralParts.push({
                header: makeCentralHeader(name.length, crc, size, offset),
                name
            });

            offset += 30 + name.length + size;
            if (offset > 0xffffffff) throw new Error("Pack excede o limite ZIP32");
        }

        const centralOffset = offset;
        let centralLength = 0;
        for (const part of centralParts) {
            writeAll(fd, part.header);
            writeAll(fd, part.name);
            centralLength += part.header.length + part.name.length;
        }

        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(0, 4); // disk number
        end.writeUInt16LE(0, 6); // central directory disk
        end.writeUInt16LE(centralParts.length, 8);
        end.writeUInt16LE(centralParts.length, 10);
        end.writeUInt32LE(centralLength, 12);
        end.writeUInt32LE(centralOffset, 16);
        end.writeUInt16LE(0, 20); // comment length
        writeAll(fd, end);

        fileLength = centralOffset + centralLength + end.length;
        closeSync(fd);
        fd = null;

        parentPort.postMessage({ ok: true, filePath, fileLength });
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
