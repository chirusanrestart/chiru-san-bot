import fs from "node:fs/promises";

const file =
    "./src/data/autosticker.json";


async function loadConfig() {

    try {

        const data =
            await fs.readFile(
                file,
                "utf8"
            );

        return JSON.parse(data);

    } catch {

        return {};

    }

}


async function saveConfig(config) {

    await fs.writeFile(
        file,
        JSON.stringify(
            config,
            null,
            4
        )
    );

}


export async function isEnabled(groupId) {

    const config =
        await loadConfig();

    return config[groupId] === true;

}


export async function enable(groupId) {

    const config =
        await loadConfig();

    config[groupId] = true;

    await saveConfig(
        config
    );

}


export async function disable(groupId) {

    const config =
        await loadConfig();

    config[groupId] = false;

    await saveConfig(
        config
    );

}
