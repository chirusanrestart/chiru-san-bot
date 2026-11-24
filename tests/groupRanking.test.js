import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chiru-group-ranking-")
);

const rankingsFile = path.join(temporaryDirectory, "group-rankings.json");
process.env.GROUP_RANKINGS_FILE = rankingsFile;

const ranking = await import("../src/services/groupRanking.js").catch(() => ({}));

const groupJid = "120363000000000001@g.us";
const memberJid = "559911223344@s.whatsapp.net";
const otherMemberJid = "559922334455@s.whatsapp.net";

function message({
    remoteJid = groupJid,
    participant = memberJid,
    fromMe = false,
    pushName = "Mel",
    message = { conversation: "oi" },
    timestamp = 1735689600
} = {}) {
    return {
        key: { remoteJid, participant, fromMe },
        pushName,
        messageTimestamp: timestamp,
        message
    };
}

test("counts each group participant and classifies wrapped messages", async () => {
    assert.equal(typeof ranking.recordGroupMessage, "function");
    assert.equal(typeof ranking.getGroupRanking, "function");

    assert.equal(await ranking.recordGroupMessage(message({
        message: { conversation: ".menu" }
    })), true);
    assert.equal(await ranking.recordGroupMessage(message({
        message: {
            ephemeralMessage: {
                message: { imageMessage: { caption: "uma foto" } }
            }
        },
        pushName: "Melissa",
        timestamp: 1735689660
    })), true);
    assert.equal(await ranking.recordGroupMessage(message({
        participant: otherMemberJid,
        pushName: "Outro membro",
        message: { audioMessage: { ptt: true } }
    })), true);

    const result = await ranking.getGroupRanking(groupJid);
    assert.equal(result.totalMessages, 3);
    assert.equal(result.membersTracked, 2);

    const mel = result.members.find(member => member.id === memberJid);
    assert.equal(mel.name, "Melissa");
    assert.equal(mel.messages, 2);
    assert.equal(mel.commands, 1);
    assert.deepEqual(mel.messageTypes, { text: 1, image: 1 });
    assert.equal(typeof mel.firstMessageAt, "string");
    assert.equal(typeof mel.lastMessageAt, "string");
});

test("ignores private messages, own messages and group messages without a participant", async () => {
    assert.equal(typeof ranking.recordGroupMessage, "function");
    const isolatedGroup = "120363000000000099@g.us";

    assert.equal(await ranking.recordGroupMessage(message({
        remoteJid: "559900000000@s.whatsapp.net"
    })), false);
    assert.equal(await ranking.recordGroupMessage(message({
        remoteJid: isolatedGroup,
        fromMe: true
    })), false);
    assert.equal(await ranking.recordGroupMessage(message({
        remoteJid: isolatedGroup,
        participant: null
    })), false);

    const result = await ranking.getGroupRanking(isolatedGroup);
    assert.equal(result.totalMessages, 0);
    assert.equal(result.membersTracked, 0);
});

test("persists aggregates as JSON without message content", async () => {
    assert.equal(typeof ranking.recordGroupMessage, "function");
    assert.equal(typeof ranking.flushGroupRankings, "function");

    const isolatedGroup = "120363000000000088@g.us";
    await ranking.recordGroupMessage(message({
        remoteJid: isolatedGroup,
        message: { extendedTextMessage: { text: "segredo que não deve ser salvo" } }
    }));
    await ranking.flushGroupRankings();

    const saved = JSON.parse(await fs.readFile(rankingsFile, "utf8"));
    assert.equal(saved.version, 1);
    assert.equal(saved.groups[isolatedGroup].totalMessages, 1);
    assert.equal(saved.groups[isolatedGroup].members[memberJid].messages, 1);
    assert.equal(JSON.stringify(saved).includes("segredo que não deve ser salvo"), false);
});

test("returns ten members by default and never more than thirty", async () => {
    assert.equal(typeof ranking.recordGroupMessage, "function");
    const isolatedGroup = "120363000000000077@g.us";

    for (let index = 0; index < 32; index++) {
        await ranking.recordGroupMessage(message({
            remoteJid: isolatedGroup,
            participant: "55990000" + String(index).padStart(4, "0") + "@s.whatsapp.net",
            pushName: "Pessoa " + index,
            message: { conversation: "mensagem " + index }
        }));
    }

    assert.equal((await ranking.getGroupRanking(isolatedGroup)).members.length, 10);
    assert.equal((await ranking.getGroupRanking(isolatedGroup, 30)).members.length, 30);
    assert.equal((await ranking.getGroupRanking(isolatedGroup, 100)).members.length, 30);
});

test.after(async () => {
    await ranking.flushGroupRankings?.();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
});
