import fs from "fs/promises";
import path from "path";

const GOOGLE_PHOTOS_FILE = path.resolve(
    process.cwd(),
    "google-photos-albums.json"
);

function normalizeText(text) {
    return String(text ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

async function loadAlbums() {
    const content = await fs.readFile(
        GOOGLE_PHOTOS_FILE,
        "utf8"
    );

    const data = JSON.parse(content);

    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return {};
    }

    return data;
}

export default {
    name: "list",

    aliases: ["packs", "packslist"],

    description: "Lista os packs disponíveis no Google Fotos",

    async execute(sock, msg) {
        const from = msg.key.remoteJid;

        try {
            const albums = await loadAlbums();
            const entries = Object.entries(albums)
                .filter(([, url]) => typeof url === "string" && url.trim())
                .sort(([a], [b]) => normalizeText(a).localeCompare(normalizeText(b), "pt-BR"));

            if (!entries.length) {
                await sock.sendMessage(
                    from,
                    { text: "📦 Nenhum pack está cadastrado no Google Fotos." },
                    { quoted: msg }
                );
                return;
            }

            const lines = entries.map(([name], index) => `${index + 1}. ${name}`);

            await sock.sendMessage(
                from,
                {
                    text:
                        `📦 *Packs prontos no Google Fotos*\n\n${lines.join("\n")}\n\n` +
                        `✨ Total: *${entries.length}* packs\n` +
                        "Use *.pack nome do personagem* para montar o pack."
                },
                { quoted: msg }
            );
        } catch (err) {
            console.error("list error:", err);
            await sock.sendMessage(
                from,
                { text: `❌ Não consegui ler a lista de packs: ${err.message}` },
                { quoted: msg }
            );
        }
    }
};
