import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    createCipheriv,
    createHash,
    createHmac,
    randomBytes
} from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { zipStickerFiles } from "./zipWorker.js";

import { proto } from "@whiskeysockets/baileys/WAProto/index.js";

import {
    getMediaKeys
} from "@whiskeysockets/baileys/lib/Utils/messages-media.js";

import {
    MEDIA_PATH_MAP,
    MEDIA_HKDF_KEY_MAPPING
} from "@whiskeysockets/baileys/lib/Defaults/index.js";

import {
    generateMessageIDV2,
    unixTimestampSeconds
} from "@whiskeysockets/baileys/lib/Utils/generics.js";

const execFileAsync =
    promisify(
        execFile
    );

const MAX_STICKERS_PER_PACK = 60;

// Lotes pequenos limitam as cópias temporárias de metadados e buffers.
const PROCESS_BATCH_SIZE = 4;

const MAX_STICKER_SIZE =
    1024 * 1024;

MEDIA_PATH_MAP[
    "sticker-pack"
] = "/mms/sticker-pack";

MEDIA_PATH_MAP[
    "thumbnail-sticker-pack"
] =
    "/mms/thumbnail-sticker-pack";

MEDIA_HKDF_KEY_MAPPING[
    "sticker-pack"
] =
    "Sticker Pack";

MEDIA_HKDF_KEY_MAPPING[
    "thumbnail-sticker-pack"
] =
    "Sticker Pack Thumbnail";

function sha256(
    buffer
) {
    return createHash(
        "sha256"
    )
        .update(buffer)
        .digest();
}

function chunk(
    array,
    size
) {
    const result = [];

    for (
        let i = 0;
        i < array.length;
        i += size
    ) {
        result.push(
            array.slice(
                i,
                i + size
            )
        );
    }

    return result;
}

function isAnimatedWebP(
    buffer
) {

    if (
        buffer.length < 12
    ) {
        return false;
    }

    if (
        buffer.toString(
            "ascii",
            0,
            4
        ) !== "RIFF"
    ) {
        return false;
    }

    if (
        buffer.toString(
            "ascii",
            8,
            12
        ) !== "WEBP"
    ) {
        return false;
    }

    let offset = 12;

    try {

        while (
            offset + 8 <=
            buffer.length
        ) {

            const chunkId =
                buffer.toString(
                    "ascii",
                    offset,
                    offset + 4
                );

            const chunkSize =
                buffer.readUInt32LE(
                    offset + 4
                );

            if (
                chunkId === "VP8X"
            ) {

                const flags =
                    buffer[
                        offset + 8
                    ] || 0;

                
                return (
                    flags & 0x02
                ) !== 0;
            }

            offset +=
                8 +
                chunkSize +
                (
                    chunkSize % 2
                );
        }

    } catch {}

    return false;
}

async function encryptBuffer(
    buffer,
    mediaType,
    mediaKey = randomBytes(32)
) {
    const { cipherKey, iv, macKey } = await getMediaKeys(mediaKey, mediaType);
    const cipher = createCipheriv("aes-256-cbc", cipherKey, iv);
    const hmac = createHmac("sha256", macKey).update(iv);
    const plainHash = createHash("sha256").update(buffer);
    const encryptedHash = createHash("sha256");
    const filePath = path.join(
        os.tmpdir(),
        `${mediaType}-${generateMessageIDV2()}-enc`
    );

    // Criptografa em blocos e grava direto no disco. Evita manter, ao mesmo
    // tempo, o ZIP original, todas as partes cifradas e um Buffer.concat gigante.
    const CHUNK_SIZE = 256 * 1024;
    let fileHandle;

    try {
        fileHandle = await fs.open(filePath, "w");

        const writeEncrypted = async (part) => {
            if (!part || part.length === 0) return;
            encryptedHash.update(part);
            hmac.update(part);

            // FileHandle.write pode gravar menos bytes do que o buffer contém.
            // Repete a escrita até persistir o bloco inteiro.
            let offset = 0;
            while (offset < part.length) {
                const { bytesWritten } = await fileHandle.write(
                    part,
                    offset,
                    part.length - offset,
                    null
                );
                if (bytesWritten <= 0) throw new Error("Falha ao gravar bloco criptografado");
                offset += bytesWritten;
            }
        };

        for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
            const end = Math.min(offset + CHUNK_SIZE, buffer.length);
            await writeEncrypted(cipher.update(buffer.subarray(offset, end)));
        }

        await writeEncrypted(cipher.final());

        const mac = hmac.digest().subarray(0, 10);
        encryptedHash.update(mac);
        let macOffset = 0;
        while (macOffset < mac.length) {
            const { bytesWritten } = await fileHandle.write(
                mac,
                macOffset,
                mac.length - macOffset,
                null
            );
            if (bytesWritten <= 0) throw new Error("Falha ao gravar MAC criptográfico");
            macOffset += bytesWritten;
        }
        await fileHandle.close();
        fileHandle = null;

        return {
            mediaKey,
            filePath,
            fileLength: buffer.length,
            fileSha256: plainHash.digest(),
            fileEncSha256: encryptedHash.digest(),
            mac
        };
    } catch (error) {
        if (fileHandle) await fileHandle.close().catch(() => {});
        await fs.unlink(filePath).catch(() => {});
        throw error;
    }
}

async function createThumbnail(
    webpBuffer
) {

    const id =
        generateMessageIDV2();

    const input =
        path.join(
            os.tmpdir(),
            `sticker-pack-${id}.webp`
        );

    const output =
        path.join(
            os.tmpdir(),
            `sticker-pack-${id}.jpg`
        );

    try {

        await fs.writeFile(
            input,
            webpBuffer
        );

        await execFileAsync(
            "ffmpeg",
            [
                "-y",

                "-i",
                input,

                "-vf",
                "scale=252:252:force_original_aspect_ratio=decrease,"
                    + "pad=252:252:(ow-iw)/2:(oh-ih)/2",

                "-frames:v",
                "1",

                "-q:v",
                "5",

                output
            ],
            {
                timeout:
                    60000
            }
        );

        return await fs.readFile(
            output
        );

    } finally {

        await fs.unlink(
            input
        ).catch(
            () => {}
        );

        await fs.unlink(
            output
        ).catch(
            () => {}
        );
    }
}

export async function createStickerPack(
    sock,
    stickers,
    options = {}
) {

    if (
        !Array.isArray(
            stickers
        )
    ) {
        throw new TypeError(
            "stickers precisa ser um array"
        );
    }

    if (
        stickers.length === 0
    ) {
        throw new Error(
            "Sticker pack vazio"
        );
    }

    if (
        stickers.length >
        MAX_STICKERS_PER_PACK
    ) {
        throw new Error(
            `Sticker pack suporta no máximo ${MAX_STICKERS_PER_PACK} stickers`
        );
    }

    if (
        typeof sock.waUploadToServer !==
        "function"
    ) {
        throw new Error(
            "Este Baileys não expôs sock.waUploadToServer"
        );
    }

    
    const stickerPackId =
        generateMessageIDV2();

    // Preserve a small, independent cover copy: the ZIP worker may take
    // ownership of full-size sticker ArrayBuffers and detach them from here.
    const cover = Buffer.from(stickers[0]);
    const stickerFiles = {};
    const transferableBuffers = new Set();

    const stickerMetadata =
        new Array(
            stickers.length
        );

    

    for (
        let i = 0;
        i < stickers.length;
        i += PROCESS_BATCH_SIZE
    ) {

        const batch =
            stickers.slice(
                i,
                i +
                PROCESS_BATCH_SIZE
            );

        const results =
            await Promise.all(
                batch.map(
                    async (
                        sticker,
                        offset
                    ) => {

                        const index =
                            i +
                            offset;

                        const buffer =
                            Buffer.isBuffer(
                                sticker
                            )
                                ? sticker
                                : Buffer.from(
                                    sticker
                                );

                        if (
                            buffer.length >
                            MAX_STICKER_SIZE
                        ) {
                            throw new Error(
                                `Sticker ${index + 1} ultrapassa 1 MB`
                            );
                        }

                        const hash =
                            sha256(
                                buffer
                            )
                                .toString(
                                    "base64url"
                                );

                        const fileName =
                            `${hash}.webp`;

                        
                        if (
                            !stickerFiles[
                                fileName
                            ]
                        ) {
                            // A full, exclusive ArrayBuffer can be transferred
                            // to the worker without copying its image bytes.
                            // Slices and pooled/shared Buffers still get copied
                            // to avoid transferring unrelated bytes or detaching
                            // another sticker that uses the same backing store.
                            const backing = buffer.buffer;
                            const ownsWholeBacking =
                                buffer.byteOffset === 0 &&
                                buffer.byteLength === backing.byteLength &&
                                !transferableBuffers.has(backing);

                            let imageData;
                            if (ownsWholeBacking) {
                                imageData = new Uint8Array(backing);
                                transferableBuffers.add(backing);
                            } else {
                                imageData = new Uint8Array(buffer);
                            }

                            stickerFiles[fileName] = [
                                imageData,
                                { level: 0 }
                            ];
                        }

                        return {
                            fileName,

                            isAnimated:
                                isAnimatedWebP(
                                    buffer
                                ),

                            emojis: [
                                "🌸"
                            ],

                            accessibilityLabel:
                                "",

                            isLottie:
                                false,

                            mimetype:
                                "image/webp"
                        };
                    }
                )
            );

        for (
            let j = 0;
            j < results.length;
            j++
        ) {

            stickerMetadata[
                i + j
            ] =
                results[j];
        }
    }

    

    const trayIconFileName =
        `${stickerPackId}.webp`;

    stickerFiles[
        trayIconFileName
    ] = [
        new Uint8Array(
            cover
        ),
        {
            level: 0
        }
    ];

    

    let zipBuffer = await zipStickerFiles(stickerFiles);
    const zipLength = zipBuffer.length;

    // O ZIP já contém os arquivos; não mantenha também o mapa de entrada em RAM.
    for (const fileName of Object.keys(stickerFiles)) delete stickerFiles[fileName];

    

    const encryptedPack =
        await encryptBuffer(
            zipBuffer,
            "sticker-pack"
        );

    // O pacote criptografado foi gravado em disco. Libera o ZIP grande antes do upload.
    zipBuffer = null;

    let uploadedPack;

    try {

        uploadedPack =
            await sock.waUploadToServer(
                encryptedPack.filePath,
                {
                    fileEncSha256B64:
                        encryptedPack
                            .fileEncSha256
                            .toString(
                                "base64"
                            ),

                    mediaType:
                        "sticker-pack",

                    timeoutMs:
                        120000
                }
            );

    } finally {

        await fs.unlink(
            encryptedPack.filePath
        ).catch(
            () => {}
        );
    }

    

    const thumbnail =
        await createThumbnail(
            cover
        );

    

    const encryptedThumbnail =
        await encryptBuffer(
            thumbnail,

            "thumbnail-sticker-pack",

            encryptedPack.mediaKey
        );

    let uploadedThumbnail;

    try {

        uploadedThumbnail =
            await sock.waUploadToServer(
                encryptedThumbnail.filePath,
                {
                    fileEncSha256B64:
                        encryptedThumbnail
                            .fileEncSha256
                            .toString(
                                "base64"
                            ),

                    mediaType:
                        "thumbnail-sticker-pack",

                    timeoutMs:
                        120000
                }
            );

    } finally {

        await fs.unlink(
            encryptedThumbnail.filePath
        ).catch(
            () => {}
        );
    }

    

    const stickerPackMessage =
        proto.Message
            .StickerPackMessage
            .fromObject({

                stickerPackId,

                name:
                    options.name ||
                    "chiru san bot",

                publisher:
                    options.publisher ||
                    "Melissa",

                packDescription:
                    options.description ||
                    "🌸 Chiru-san Bot",

                stickerPackOrigin:
                    proto.Message
                        .StickerPackMessage
                        .StickerPackOrigin
                        .USER_CREATED,

                stickerPackSize:
                    zipLength,

                stickers:
                    stickerMetadata,

                fileSha256:
                    encryptedPack
                        .fileSha256,

                fileEncSha256:
                    encryptedPack
                        .fileEncSha256,

                mediaKey:
                    encryptedPack
                        .mediaKey,

                directPath:
                    uploadedPack
                        .directPath,

                fileLength:
                    zipLength,

                mediaKeyTimestamp:
                    unixTimestampSeconds(),

                trayIconFileName,

                thumbnailDirectPath:
                    uploadedThumbnail
                        .directPath,

                thumbnailSha256:
                    encryptedThumbnail
                        .fileSha256,

                thumbnailEncSha256:
                    encryptedThumbnail
                        .fileEncSha256,

                thumbnailHeight:
                    252,

                thumbnailWidth:
                    252,

                imageDataHash:
                    sha256(
                        thumbnail
                    )
                        .toString(
                            "base64"
                        )
            });

    return stickerPackMessage;
}

export async function sendStickerPack(
    sock,
    jid,
    stickers,
    options = {}
) {

    const packs =
        chunk(
            stickers,
            MAX_STICKERS_PER_PACK
        );

    for (
        const pack of packs
    ) {

        const message =
            await createStickerPack(
                sock,
                pack,
                options
            );

        // Os bytes já foram compactados, criptografados e enviados ao servidor.
        // Solta as referências dos buffers antes de aguardar a confirmação do relay.
        pack.length = 0;
        stickers.length = 0;

        await sock.relayMessage(
            jid,
            {
                stickerPackMessage:
                    message
            },
            {
                messageId:
                    generateMessageIDV2(
                        sock.user?.id
                    )
            }
        );

        
        if (
            packs.length > 1
        ) {

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        500
                    )
            );
        }
    }
}

export {
    MAX_STICKERS_PER_PACK,
    PROCESS_BATCH_SIZE
};
