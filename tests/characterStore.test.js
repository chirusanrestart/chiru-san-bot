import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
    setSelectedCharacter, getSelectedCharacter, getConversation,
    appendTurn, startNewConversation, clearUserHistory
} from "../src/ai/characterStore.js";

const file = path.resolve("src/data/character-chat.json");

test("isola seleção e histórico por usuário, chat e personagem", async () => {
    await fs.rm(file, { force: true });
    await setSelectedCharacter("user-A", "chat-1", "furina");
    await setSelectedCharacter("user-B", "chat-1", "najimi");
    assert.equal(await getSelectedCharacter("user-A", "chat-1"), "furina");
    assert.equal(await getSelectedCharacter("user-B", "chat-1"), "najimi");
    assert.equal(await getSelectedCharacter("user-A", "chat-2"), null);

    const a = await getConversation("user-A", "chat-1", "furina");
    await appendTurn("user-A", "chat-1", "furina", a.conversationId, "segredo A", "resposta A");
    assert.deepEqual((await getConversation("user-A", "chat-1", "furina")).history.map(x => x.content), ["segredo A", "resposta A"]);
    assert.deepEqual((await getConversation("user-B", "chat-1", "najimi")).history, []);
    assert.deepEqual((await getConversation("user-A", "chat-1", "najimi")).history, []);
    assert.deepEqual((await getConversation("user-A", "chat-2", "furina")).history, []);
});

test("conversa nova separa o histórico e limpar remove apenas os dados daquele usuário", async () => {
    const old = await getConversation("user-A", "chat-1", "furina");
    await startNewConversation("user-A", "chat-1", "furina");
    const fresh = await getConversation("user-A", "chat-1", "furina");
    assert.notEqual(fresh.conversationId, old.conversationId);
    assert.deepEqual(fresh.history, []);

    await setSelectedCharacter("user-B", "chat-1", "najimi");
    const b = await getConversation("user-B", "chat-1", "najimi");
    await appendTurn("user-B", "chat-1", "najimi", b.conversationId, "privado B", "resposta B");
    await clearUserHistory("user-A");
    assert.deepEqual((await getConversation("user-B", "chat-1", "najimi")).history.map(x => x.content), ["privado B", "resposta B"]);
    assert.equal(await getSelectedCharacter("user-B", "chat-1"), "najimi");
    await fs.rm(file, { force: true });
});
