import { parentPort } from "node:worker_threads";
import { getMegapackHistory } from "../services/megapackHistory.js";

try {
    const packs = await getMegapackHistory();
    const unique = new Map();

    for (const pack of packs) {
        const name = String(pack?.name || "").trim();
        if (!name) continue;

        const key = name.toLocaleLowerCase("pt-BR");
        if (!unique.has(key)) unique.set(key, name);
    }

    const names = [...unique.values()];
    names.sort((a, b) => a.localeCompare(b, "pt-BR"));

    if (!names.length) {
        parentPort.postMessage({
            ok: true,
            count: 0,
            text: ""
        });
    } else {
        const lines = names.map((name, index) => `${index + 1}. ${name}`);
        const text = [
            "📚 *CATÁLOGO COMPLETO DO MEGAPACK*",
            `💖 Personagens únicos: *${names.length}*`,
            "",
            ...lines
        ].join("\n");

        parentPort.postMessage({
            ok: true,
            count: names.length,
            text
        });
    }
} catch (error) {
    parentPort.postMessage({
        ok: false,
        error: error?.stack || error?.message || String(error)
    });
}
