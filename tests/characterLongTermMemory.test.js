import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
    getCharacterLongTermMemory,
    registerCharacterTurn,
    mergeCharacterLongTermMemory,
    clearCharacterLongTermMemory,
    clearUserLongTermMemory,
} from "../src/ai/characterLongTermMemory.js";

const file = path.resolve("src/data/character-long-term-memory.json");

test("isola memórias por usuário, chat e personagem", async () => {
    await fs.rm(file, { force: true });
    await mergeCharacterLongTermMemory("user-a", "chat-a", "furina", ["Gosta de histórias dramáticas."], 0);
    assert.deepEqual((await getCharacterLongTermMemory("user-a", "chat-a", "furina")).memories, ["Gosta de histórias dramáticas."]);
    assert.deepEqual((await getCharacterLongTermMemory("user-b", "chat-a", "furina")).memories, []);
    assert.deepEqual((await getCharacterLongTermMemory("user-a", "chat-a", "najimi")).memories, []);
    assert.deepEqual((await getCharacterLongTermMemory("user-a", "chat-b", "furina")).memories, []);
    await fs.rm(file, { force: true });
});

test("solicita extração em intervalos de quatro turnos e mantém contagem persistente", async () => {
    await fs.rm(file, { force: true });
    for (let turn = 1; turn <= 3; turn++) {
        const result = await registerCharacterTurn("user-a", "chat-a", "furina");
        assert.equal(result.turnCount, turn);
        assert.equal(result.shouldExtract, false);
    }
    const fourth = await registerCharacterTurn("user-a", "chat-a", "furina");
    assert.equal(fourth.turnCount, 4);
    assert.equal(fourth.shouldExtract, true);
    await mergeCharacterLongTermMemory("user-a", "chat-a", "furina", ["Gosta de histórias dramáticas."], fourth.turnCount);
    const fifth = await registerCharacterTurn("user-a", "chat-a", "furina");
    assert.equal(fifth.shouldExtract, false);
    assert.equal((await getCharacterLongTermMemory("user-a", "chat-a", "furina")).turnCount, 5);
    await fs.rm(file, { force: true });
});

test("deduplica memórias e permite limpar por personagem ou usuário", async () => {
    await fs.rm(file, { force: true });
    await mergeCharacterLongTermMemory("user-a", "chat-a", "furina", ["Gosta de chá.", "Gosta de chá.", "  Gosta   de chá. "], 0);
    await mergeCharacterLongTermMemory("user-a", "chat-a", "najimi", ["Prefere conversas engraçadas."], 0);
    assert.equal((await getCharacterLongTermMemory("user-a", "chat-a", "furina")).memories.length, 1);
    await clearCharacterLongTermMemory("user-a", "chat-a", "furina");
    assert.deepEqual((await getCharacterLongTermMemory("user-a", "chat-a", "furina")).memories, []);
    assert.deepEqual((await getCharacterLongTermMemory("user-a", "chat-a", "najimi")).memories, ["Prefere conversas engraçadas."]);
    await clearUserLongTermMemory("user-a");
    assert.deepEqual((await getCharacterLongTermMemory("user-a", "chat-a", "najimi")).memories, []);
    await fs.rm(file, { force: true });
});
