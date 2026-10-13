import test from "node:test";
import assert from "node:assert/strict";
import { historyLimit, withConversationLock } from "../src/ai/characterStore.js";

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
        withConversationLock("user-a", "chat-a", characterId, async () => {
            active++;
            peak = Math.max(peak, active);
            await delay(10);
            active--;
        })
    ));

    assert.equal(peak, 2);
});

test("keeps the recent context bounded", () => {
    assert.equal(historyLimit, 12);
});
