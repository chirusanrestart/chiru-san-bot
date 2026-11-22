import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chiru-command-limiter-")
);

const limitsFile = path.join(temporaryDirectory, "command-limits.json");
process.env.COMMAND_LIMITS_FILE = limitsFile;

const {
    getGroupCommandLimits,
    isCommandEnabled,
    setCommandEnabled
} = await import("../src/services/commandLimiter.js");

const groupA = "120363000000000001@g.us";
const groupB = "120363000000000002@g.us";

test("commands default to enabled, including in private chats", async () => {
    assert.equal(await isCommandEnabled(groupA, "play"), true);
    assert.equal(await isCommandEnabled("559999999999@s.whatsapp.net", "play"), true);
});

test("settings persist independently for each group and serialize concurrent writes", async () => {
    await Promise.all([
        setCommandEnabled(groupA, ".PLAY", false),
        setCommandEnabled(groupB, "sticker", false)
    ]);

    assert.equal(await isCommandEnabled(groupA, "play"), false);
    assert.equal(await isCommandEnabled(groupA, "sticker"), true);
    assert.equal(await isCommandEnabled(groupB, "play"), true);
    assert.equal(await isCommandEnabled(groupB, "sticker"), false);

    const saved = JSON.parse(await fs.readFile(limitsFile, "utf8"));
    assert.deepEqual(saved, {
        [groupA]: { play: false },
        [groupB]: { sticker: false }
    });

    await setCommandEnabled(groupA, "play", true);
    assert.equal(await isCommandEnabled(groupA, "play"), true);

    const updated = await getGroupCommandLimits(groupA);
    assert.deepEqual(updated, { play: true });
});

test("rejects values that are not group JIDs", async () => {
    await assert.rejects(
        setCommandEnabled("559999999999@s.whatsapp.net", "play", false),
        /identificador.*grupo/i
    );
});

test.after(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
});
