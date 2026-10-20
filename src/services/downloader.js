import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DOWNLOAD_DIR = path.resolve("downloads");

await fs.mkdir(DOWNLOAD_DIR, {
  recursive: true
});

export default class Downloader {

  static download(url, options = {}) {

    return new Promise((resolve, reject) => {

      const type = options.type || "video";

      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        reject(new Error("URL inválida. Envie um link completo com http:// ou https://."));
        return;
      }

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        reject(new Error("Por segurança, o download aceita apenas URLs HTTP ou HTTPS."));
        return;
      }

      const output = path.join(
        DOWNLOAD_DIR,
        `${randomUUID()}-%(title)s.%(ext)s`
      );

      const args = [

        "--newline",

        "--no-playlist",

        "--extractor-args",
        "youtube:player_client=android,web",

        "--user-agent",
        "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",

        "--referer",
        "https://www.youtube.com/",

        "--restrict-filenames",

        "--print",
        "ChiruTitle:%(title)s",

        "--print",
        "ChiruDescription:%(description)s",

        "--print",
        "ChiruThumbnail:%(thumbnail)s",

        "--print",
        "after_move:ChiruFile:%(filepath)s",

        "-f",

        type === "audio"
          ? "bestaudio/best"
          : "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*[vcodec^=avc1]/b",

        "--merge-output-format",
        "mp4",

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

      // Impede que uma URL iniciada por hífen seja interpretada como opção do yt-dlp.
      args.push("--", url);

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

        const text = data.toString();

        errorData += text;

      });

      yt.stdout.on("error", error => {

        if (error.code !== "ECONNRESET") {
          reject(error);
        }

      });

      yt.stderr.on("error", error => {

        if (error.code !== "ECONNRESET") {
          reject(error);
        }

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
        let description = null;
        let thumbnail = null;
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

          if (line.startsWith("ChiruDescription:")) {
            description = line.replace("ChiruDescription:", "").trim();
          }

          if (line.startsWith("ChiruThumbnail:")) {
            thumbnail = line.replace("ChiruThumbnail:", "").trim();
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

        if (
          !filePath ||
          !(await exists(filePath))
        ) {
          return reject(
            new Error("O yt-dlp não informou um arquivo válido para este download.")
          );
        }

        resolve({

          success: true,

          file: filePath,

          title:
            title ||
            path.basename(filePath),

          description: description || null,

          thumbnail: thumbnail || null

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
