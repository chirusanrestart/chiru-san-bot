import { spawn } from "node:child_process";

export function getPlaylistTracks(url) {
  return new Promise((resolve, reject) => {
    const args = [
      "--flat-playlist",
      "--ignore-errors",
      "--no-warnings",
      "--print",
      "%(id)s\t%(title)s",
      url
    ];

    const yt = spawn("yt-dlp", args);

    let stdout = "";
    let stderr = "";

    yt.stdout.on("data", data => {
      stdout += data.toString();
    });

    yt.stderr.on("data", data => {
      stderr += data.toString();
    });

    yt.on("error", error => {
      reject(error);
    });

    yt.on("close", code => {
      const tracks = stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const separator = line.indexOf("\t");

          if (separator === -1) {
            return null;
          }

          const id = line.slice(0, separator).trim();
          const title = line.slice(separator + 1).trim();

          if (!id || !title) {
            return null;
          }

          return {
            id,
            title,
            url: `https://www.youtube.com/watch?v=${id}`
          };
        })
        .filter(Boolean);

      if (tracks.length === 0) {
        return reject(
          new Error(
            stderr.trim() ||
            "Nenhuma música encontrada na playlist."
          )
        );
      }

      if (code !== 0) {
        console.warn(
          `[PLAYLIST] yt-dlp terminou com código ${code}, mas ${tracks.length} músicas foram encontradas.`
        );
      }

      resolve(tracks);
    });
  });
}
