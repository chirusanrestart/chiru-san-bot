import { runFFmpegSticker } from "./ffmpeg.js";
import webp from "node-webpmux";


function createExif(packname, author) {

    const json = {
        "sticker-pack-id": "chiru-san-bot",
        "sticker-pack-name": packname,
        "sticker-pack-publisher": author,
        "emojis": [
            "🌸"
        ]
    };


    const jsonBuff = Buffer.from(
        JSON.stringify(json),
        "utf-8"
    );


    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2a, 0x00,
        0x08, 0x00,
        0x00, 0x00,
        0x01, 0x00,
        0x41, 0x57,
        0x07, 0x00,
        0x00, 0x00,
        0x00, 0x00,
        0x16, 0x00,
        0x00, 0x00
    ]);


    const exif = Buffer.concat([
        exifAttr,
        jsonBuff
    ]);


    exif.writeUIntLE(
        jsonBuff.length,
        14,
        4
    );


    return exif;

}



export async function createSticker(
    input,
    output,
    metadata,
    type = "image"
) {


    await runFFmpegSticker(
        input,
        output,
        type
    );



    const img =
        new webp.Image();



    await img.load(
        output
    );



    img.exif =
        createExif(
            metadata.packname,
            metadata.author
        );



    await img.save(
        output
    );



    return output;

}
