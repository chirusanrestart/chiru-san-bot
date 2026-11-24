import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chiru-group-rank-command-")
);
process.env.GROUP_RANKINGS_FILE = path.join(temporaryDirectory, "group-rankings.json");

const [{ default: rankCommand }, ranking] = await Promise.all([
    import("../src/commands/member/rank.js").catch(() => ({ default: null })),
    import("../src/services/groupRanking.js")
]);

const groupJid = "120363000000000001@g.us";
const memberJid = "559911223344@s.whatsapp.net";

function createMessage(text = ".rank", remoteJid = groupJid) {
    return {
        key: { remoteJid, participant: memberJid },
        message: { conversation: text }
    };
}

function createSocket() {
    const sent = [];
    return {
        sent,
        async sendMessage(jid, content, options) {
            sent.push({ jid, content, options });
            return { key: { id: String(sent.length) } };
        }
    };
}

test("shows the ten most active users and includes WhatsApp mentions by default", async () => {
    assert.equal(typeof rankCommand?.execute, "function");

    for (let index = 0; index < 12; index++) {
        await ranking.recordGroupMessage({
            key: {
                remoteJid: groupJid,
                participant: "55990000" + String(index).padStart(4, "0") + "@s.whatsapp.net"
            },
            pushName: "Pessoa " + index,
            message: { conversation: "mensagem" }
        });
    }

    const sock = createSocket();
    await rankCommand.execute(sock, createMessage(), []);

    assert.equal(sock.sent.length, 1);
    assert.match(sock.sent[0].content.text, /TOP 10/i);
    assert.match(sock.sent[0].content.text, /12\\* mensagens/i);
    assert.equal(sock.sent[0].content.mentions.length, 10);
});

test("accepts a requested top 30 and clamps larger values", async () => {
    assert.equal(typeof rankCommand?.execute, "function");
    const sock = createSocket();

    await rankCommand.execute(sock, createMessage(), ["99"]);
    assert.match(sock.sent[0].content.text, /TOP 30/i);
});

test("does not allow rank in private conversations", async () => {
    assert.equal(typeof rankCommand?.execute, "function");
    const sock = createSocket();

    await rankCommand.execute(
        sock,
        createMessage(".rank", "559900000000@s.whatsapp.net"),
        []
    );

    assert.match(sock.sent[0].content.text, /somente em grupos/i);
});

test.after(async () => {
    await ranking.flushGroupRankings();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
});
