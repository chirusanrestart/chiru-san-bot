import test from "node:test";
import assert from "node:assert/strict";
import {
    historyLimit,
    withConversationLock,
    withUserMemoryLock
} from "../src/ai/characterStore.js";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test("serializes turns for the same user, chat, and character", async () => {
    const order = [];
    let active = 0;
    let peak = 0;

    await Promise.all([1, 2, 3].map(id =>
        withConversationLock("user-a", "chat-a", "furina", async () => {
            active++;
            peak = Math.max(peak, active);
            order.push(`start-${id}`);
            await delay(5);
            order.push(`end-${id}`);
            active--;
        })
    ));

    assert.equal(peak, 1);
    assert.deepEqual(order, [
        "start-1", "end-1",
        "start-2", "end-2",
        "start-3", "end-3"
    ]);
});

test("allows separate characters to process independently", async () => {
    let active = 0;
    let peak = 0;

    await Promise.all(["furina", "miku"].map(characterId =>
        withConversationLock("user-b", "chat-a", characterId, async () => {
            active++;
            peak = Math.max(peak, active);
            await delay(10);
            active--;
        })
    ));

    assert.equal(peak, 2);
});

test("memory reset waits for active turns and blocks later turns until done", async () => {
    const order = [];
    let releaseTurn;
    const turnGate = new Promise(resolve => { releaseTurn = resolve; });

    const turn = withUserMemoryLock("user-reset", "read", async () => {
        order.push("turn-start");
        await turnGate;
        order.push("turn-end");
    });

    await delay(0);
    const reset = withUserMemoryLock("user-reset", "write", async () => {
        order.push("reset");
    });
    const laterTurn = withUserMemoryLock("user-reset", "read", async () => {
        order.push("later-turn");
    });

    await delay(5);
    assert.deepEqual(order, ["turn-start"]);
    releaseTurn();
    await Promise.all([turn, reset, laterTurn]);

    assert.deepEqual(order, ["turn-start", "turn-end", "reset", "later-turn"]);
});

test("releases conversation locks after an operation fails", async () => {
    await assert.rejects(
        withConversationLock("user-c", "chat-a", "furina", async () => {
            throw new Error("expected test failure");
        }),
        /expected test failure/
    );

    let completed = false;
    await withConversationLock("user-c", "chat-a", "furina", async () => {
        completed = true;
    });
    assert.equal(completed, true);
});

test("keeps the recent context bounded", () => {
    assert.equal(historyLimit, 40);
});
