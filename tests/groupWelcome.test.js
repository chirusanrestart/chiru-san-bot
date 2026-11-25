import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chiru-welcome-"));
process.env.WELCOME_SETTINGS_FILE = path.join(directory, "settings.json");

const {
    isWelcomeEnabled,
    setWelcomeEnabled
} = await import("../src/services/groupWelcome.js");

const firstGroup = "120363000000000001@g.us";
const secondGroup = "120363000000000002@g.us";

test("welcome is disabled by default and settings are isolated per group", async () => {
    assert.equal(await isWelcomeEnabled(firstGroup), false);
    assert.equal(await isWelcomeEnabled(secondGroup), false);

    await setWelcomeEnabled(firstGroup, true);

    assert.equal(await isWelcomeEnabled(firstGroup), true);
    assert.equal(await isWelcomeEnabled(secondGroup), false);
});

test("welcome can be disabled again", async () => {
    await setWelcomeEnabled(firstGroup, false);
    assert.equal(await isWelcomeEnabled(firstGroup), false);
});

test("rejects private-chat JIDs", async () => {
    await assert.rejects(
        setWelcomeEnabled("559999999999@s.whatsapp.net", true),
        /grupos/
    );
});

test.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
});
