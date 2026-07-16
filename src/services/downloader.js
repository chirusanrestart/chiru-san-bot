import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const DOWNLOAD_DIR = path.resolve("downloads");

await fs.mkdir(DOWNLOAD_DIR, { recursive: true });


export default class Downloader {

    static download(url, options = {}) {

        return new Promise((resolve, reject) => {

            const type = options.type || "video";


            const output = path.join(
                DOWNLOAD_DIR,
                "%(title)s.%(ext)s"
            );


            const args = [

                "--newline",
                "--no-playlist",

                "--restrict-filenames",

                "--print",
                "ChiruTitle:%(title)s",

                "--print",
                "after_move:ChiruFile:%(filepath)s",


                "-f",

                type === "audio"

                    ? "bestaudio/best"

                    : "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*[vcodec^=avc1]/b",


                "--merge-output-format",
                "mp4",


                "--external-downloader",
                "aria2c",


                "--external-downloader-args",
                "-x8 -s8 -k1M",


                "-o",
                output

            ];


            if (type === "audio") {

                args.push(

                    "-x",

                    "--audio-format",
                    "mp3",

                    "--audio-quality",
                    "0"

                );

            } else {

                args.push(

                    "--postprocessor-args",

                    "ffmpeg:-c:v libx264 -c:a aac"

                );

            }


            args.push(url);


            const yt = spawn(
                "yt-dlp",
                args
            );


            let outputData = "";
            let errorData = "";


            yt.stdout.on("data", data => {

                const text = data.toString();

                console.log(text);

                outputData += text;

            });


            yt.stderr.on("data", data => {

                errorData += data.toString();

            });


            yt.on("error", err => {

                reject(err);

            });


            yt.on("close", async code => {


                if (code !== 0) {

                    return reject(

                        new Error(

                            errorData ||

                            "Falha no download."

                        )

                    );

                }


                const lines = outputData

                    .split("\n")

                    .map(x => x.trim())

                    .filter(Boolean);



                let title = null;
                let filePath = null;



                for (const line of lines) {


                    if (line.startsWith("ChiruTitle:")) {

                        title = line

                            .replace(
                                "ChiruTitle:",
                                ""
                            )

                            .trim();

                    }


                    if (line.startsWith("ChiruFile:")) {

                        filePath = line

                            .replace(
                                "ChiruFile:",
                                ""
                            )

                            .trim();

                    }

                }



                if (!filePath || !(await exists(filePath))) {


                    const files = await fs.readdir(
                        DOWNLOAD_DIR
                    );


                    if (files.length === 0) {

                        return reject(

                            new Error(
                                "Arquivo não encontrado."
                            )

                        );

                    }



                    const stats = await Promise.all(

                        files.map(async file => {


                            const full = path.join(

                                DOWNLOAD_DIR,

                                file

                            );


                            const stat = await fs.stat(full);



                            return {

                                path: full,

                                time: stat.mtimeMs

                            };


                        })

                    );



                    stats.sort(

                        (a,b) => b.time - a.time

                    );



                    filePath = stats[0].path;


                }



                resolve({

                    success: true,

                    file: filePath,

                    title:

                        title ||

                        path.basename(filePath)

                });


            });


        });

    }

}



async function exists(file) {

    try {

        await fs.access(file);

        return true;

    } catch {

        return false;

    }

}
