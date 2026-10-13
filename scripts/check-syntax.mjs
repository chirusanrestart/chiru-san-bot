import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src", "tests", "scripts"];
const files = [];

async function collect(directory) {
    let entries;
    try {
        entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") return;
        throw error;
    }

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules") continue;
            await collect(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }
}

for (const root of roots) {
    await collect(root);
}

let failures = 0;
for (const file of files.sort()) {
    const result = spawnSync(process.execPath, ["--check", file], {
        encoding: "utf8"
    });

    if (result.error || result.status !== 0) {
        failures++;
        console.error(`\n❌ Erro de sintaxe: ${file}`);
        if (result.stderr) console.error(result.stderr.trim());
        if (result.stdout) console.error(result.stdout.trim());
        if (result.error) console.error(result.error.message);
    }
}

if (failures > 0) {
    console.error(`\n❌ ${failures} arquivo(s) com erro de sintaxe.`);
    process.exitCode = 1;
} else {
    console.log(`✅ Sintaxe válida em ${files.length} arquivo(s) JavaScript.`);
}
