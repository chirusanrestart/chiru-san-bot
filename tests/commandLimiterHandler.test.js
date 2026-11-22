import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chiru-command-handler-")
);

process.env.COMMAND_LIMITS_FILE = path.join(
    temporaryDirectory,
    "command-limits.json"
);

const [
    { default: CommandHandler },
    { setCommandEnabled }
] = await Promise.all([
    import("../src/handlers/CommandHandler.js"),
    import("../src/services/commandLimiter.js")
]);

const groupJid = "120363000000000010@g.us";
const privateJid = "559999999999@s.whatsapp.net";

function createHarness() {
    const sent = [];
    const sock = {
        async sendMessage(jid, content, options) {
            sent.push({ jid, content, options });
            return { key: { id: String(sent.length) } };
        }
    };

    return {
        handler: new CommandHandler(sock),
        sent
    };
}

function createMessage(text, remoteJid = groupJid) {
    return {
        key: {
            remoteJid,
            participant: "559999999999@s.whatsapp.net"
        },
        message: {
            conversation: text
        }
    };
}

test("blocks a registered command disabled for this group", async () => {
    const { handler, sent } = createHarness();
    let executions = 0;

    handler.commands.set("play", {
        name: "play",
        async execute() {
            executions++;
        }
    });

    await setCommandEnabled(groupJid, "play", false);
    await handler.handle(createMessage(".play example"));

    assert.equal(executions, 0);
    assert.match(sent.at(-1)?.content?.text || "", /desativado/i);
    assert.match(sent.at(-1)?.content?.text || "", /play/i);
});

test("checks aliases against their canonical command name", async () => {
    const { handler, sent } = createHarness();
    let executions = 0;

    handler.commands.set("pack", {
        name: "pack",
        async execute() {
            executions++;
        }
    });

    await setCommandEnabled(groupJid, "pack", false);
    await handler.handle(createMessage(".pack2 personagem"));

    assert.equal(executions, 0);
    assert.match(sent.at(-1)?.content?.text || "", /desativado/i);
});

test("blocks special media commands before starting a download", async () => {
    const { handler, sent } = createHarness();

    await setCommandEnabled(groupJid, "mp3", false);
    await handler.handle(createMessage(".mp3"));

    assert.equal(sent.length, 1);
    assert.match(sent[0]?.content?.text || "", /desativado/i);
    assert.doesNotMatch(sent[0]?.content?.text || "", /Envie o link/i);
});

test("keeps private-chat commands unaffected by group settings", async () => {
    const { handler } = createHarness();
    let executions = 0;

    handler.commands.set("play", {
        name: "play",
        async execute() {
            executions++;
        }
    });

    await setCommandEnabled(groupJid, "play", false);
    await handler.handle(createMessage(".play", privateJid));

    assert.equal(executions, 1);
});

test.after(async () => {
    await fs.rm(temporaryDirectory, {
        recursive: true,
        force: true
    });
});
