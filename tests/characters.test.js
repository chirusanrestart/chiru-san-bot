import test from "node:test";
import assert from "node:assert/strict";
import { listCharacters, findCharacter, getCharacter } from "../src/ai/characters.js";

test("catálogo mantém os 96 personagens cadastrados", () => {
    const characters = listCharacters();
    assert.equal(characters.length, 96);
});

test("todos os personagens têm identificadores únicos e dados essenciais", () => {
    const characters = listCharacters();
    const ids = characters.map(character => character.id);

    assert.equal(new Set(ids).size, ids.length, "não deve haver IDs duplicados");

    for (const character of characters) {
        assert.ok(character.id?.trim(), "personagem sem ID");
        assert.ok(character.name?.trim(), `nome ausente para ${character.id}`);
        assert.ok(character.description?.trim(), `descrição ausente para ${character.id}`);
        assert.ok(Array.isArray(character.aliases), `aliases inválidos para ${character.id}`);

        const fullCharacter = getCharacter(character.id);
        assert.ok(fullCharacter, `perfil completo ausente para ${character.id}`);
        assert.ok(fullCharacter.systemPrompt?.trim(), `systemPrompt vazio para ${character.id}`);
    }
});

test("busca encontra personagens por ID, nome e alias", () => {
    const furina = getCharacter("furina");
    assert.ok(furina);
    assert.equal(findCharacter("furina")?.id, furina.id);
    assert.equal(findCharacter(furina.name)?.id, furina.id);

    if (furina.aliases.length > 0) {
        assert.equal(findCharacter(furina.aliases[0])?.id, furina.id);
    }
});

test("busca ignora espaços externos e diferenças entre maiúsculas e minúsculas", () => {
    assert.equal(findCharacter("  FURINA  ")?.id, "furina");
    assert.equal(findCharacter("") , null);
    assert.equal(findCharacter("   "), null);
});
