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

import { zipSync } from "fflate";

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


/*
 * ============================================================
 * CONFIGURAÇÃO
 * ============================================================
 */

const MAX_STICKERS_PER_PACK = 60;

const PROCESS_BATCH_SIZE = 16;

const MAX_STICKER_SIZE =
    1024 * 1024;


/*
 * ============================================================
 * ADICIONA OS TIPOS DE MÍDIA DO STICKER PACK AO RC13
 * ============================================================
 *
 * O rc13 já possui waUploadToServer().
 *
 * O que falta no mapa oficial dessa versão são os dois
 * tipos usados pelo protocolo de sticker pack.
 */

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


/*
 * ============================================================
 * FUNÇÕES AUXILIARES
 * ============================================================
 */

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


/*
 * Detecta WebP animado.
 */
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

                /*
                 * Bit 1 = animation.
                 */
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


/*
 * ============================================================
 * CRIPTOGRAFIA DE MÍDIA
 * ============================================================
 *
 * É equivalente ao encryptedStream() do Baileys,
 * mas permite fornecer uma mediaKey já existente.
 *
 * Isso é necessário porque a thumbnail do sticker pack
 * utiliza a MESMA mediaKey do ZIP.
 */

async function encryptBuffer(
    buffer,
    mediaType,
    mediaKey = randomBytes(32)
) {

    const {
        cipherKey,
        iv,
        macKey
    } =
        await getMediaKeys(
            mediaKey,
            mediaType
        );


    const cipher =
        createCipheriv(
            "aes-256-cbc",
            cipherKey,
            iv
        );


    const hmac =
        createHmac(
            "sha256",
            macKey
        )
            .update(iv);


    const plainHash =
        createHash(
            "sha256"
        );


    const encryptedHash =
        createHash(
            "sha256"
        );


    plainHash.update(
        buffer
    );


    const encryptedParts = [];


    const first =
        cipher.update(
            buffer
        );

    if (
        first.length
    ) {

        encryptedParts.push(
            first
        );

        encryptedHash.update(
            first
        );

        hmac.update(
            first
        );
    }


    const last =
        cipher.final();

    if (
        last.length
    ) {

        encryptedParts.push(
            last
        );

        encryptedHash.update(
            last
        );

        hmac.update(
            last
        );
    }


    /*
     * WhatsApp usa os primeiros 10 bytes
     * do HMAC como MAC.
     */
    const mac =
        hmac
            .digest()
            .subarray(
                0,
                10
            );


    encryptedHash.update(
        mac
    );


    const encryptedBuffer =
        Buffer.concat([
            ...encryptedParts,
            mac
        ]);


    /*
     * Salva em arquivo temporário porque
     * waUploadToServer() recebe um caminho.
     */
    const filePath =
        path.join(
            os.tmpdir(),
            `${mediaType}-${generateMessageIDV2()}-enc`
        );


    await fs.writeFile(
        filePath,
        encryptedBuffer
    );


    return {
        mediaKey,

        filePath,

        fileLength:
            buffer.length,

        fileSha256:
            plainHash.digest(),

        fileEncSha256:
            encryptedHash.digest(),

        mac
    };
}


/*
 * ============================================================
 * THUMBNAIL
 * ============================================================
 */

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


/*
 * ============================================================
 * CRIA UM STICKER PACK
 * ============================================================
 */

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


    /*
     * ID único do pack.
     */
    const stickerPackId =
        generateMessageIDV2();


    const stickerFiles = {};

    const stickerMetadata =
        new Array(
            stickers.length
        );


    /*
     * ========================================================
     * PROCESSAMENTO EM LOTES DE 16
     * ========================================================
     */

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


                        /*
                         * Só coloca uma vez no ZIP
                         * se houver stickers duplicados.
                         */
                        if (
                            !stickerFiles[
                                fileName
                            ]
                        ) {

                            stickerFiles[
                                fileName
                            ] = [
                                new Uint8Array(
                                    buffer
                                ),
                                {
                                    level: 0
                                }
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


    /*
     * ========================================================
     * COVER / TRAY ICON
     * ========================================================
     *
     * O WhatsApp espera o cover dentro do ZIP.
     */

    const cover =
        Buffer.isBuffer(
            stickers[0]
        )
            ? stickers[0]
            : Buffer.from(
                stickers[0]
            );


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


    /*
     * ========================================================
     * ZIP
     * ========================================================
     */

    const zipBuffer =
        Buffer.from(
            zipSync(
                stickerFiles
            )
        );


    /*
     * ========================================================
     * CRIPTOGRAFA O PACK
     * ========================================================
     */

    const encryptedPack =
        await encryptBuffer(
            zipBuffer,
            "sticker-pack"
        );


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


    /*
     * ========================================================
     * THUMBNAIL
     * ========================================================
     */

    const thumbnail =
        await createThumbnail(
            cover
        );


    /*
     * IMPORTANTE:
     *
     * A thumbnail usa a MESMA mediaKey
     * do sticker-pack.
     */

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


    /*
     * ========================================================
     * MONTA O PROTOCOLO
     * ========================================================
     */

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
                    "Chiru-san Bot",

                packDescription:
                    options.description ||
                    "🌸 Chiru-san Bot",

                stickerPackOrigin:
                    proto.Message
                        .StickerPackMessage
                        .StickerPackOrigin
                        .USER_CREATED,

                stickerPackSize:
                    zipBuffer.length,

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
                    zipBuffer.length,

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


/*
 * ============================================================
 * ENVIA STICKER PACK
 * ============================================================
 */

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


        /*
         * Se houver mais de um pack,
         * dá um pequeno espaço entre eles.
         */
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


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

export {
    MAX_STICKERS_PER_PACK,
    PROCESS_BATCH_SIZE
};
