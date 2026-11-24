import test from "node:test";
import assert from "node:assert/strict";
import { listCharacters, findCharacter, getCharacter } from "../src/ai/characters.js";

test("catálogo mantém os 209 personagens cadastrados após a expansão", () => {
    const characters = listCharacters();
    assert.equal(characters.length, 209);
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
    assert.equal(findCharacter("Anby Demara")?.id, "anby-demara");
    assert.equal(findCharacter("Nicole Demara")?.id, "nicole-demara");
    assert.equal(findCharacter("Perlica")?.id, "perlica");

    if (furina.aliases.length > 0) {
        assert.equal(findCharacter(furina.aliases[0])?.id, furina.id);
    }
});

test("busca ignora espaços externos e diferenças entre maiúsculas e minúsculas", () => {
    assert.equal(findCharacter("  FURINA  ")?.id, "furina");
    assert.equal(findCharacter("") , null);
    assert.equal(findCharacter("   "), null);
});

test("imagens selecionadas apontam para os seis personagens prioritários", () => {
    const expectedImages = [
        ["anby-demara", "https://img.gachabase.net/conv/zzz/assets/b4ab0294ac888e092e88dad1b15eb993.png?q=50&sig=05c47ba96bcc4e0b12618a3bbfd293d8137412510ada0b5395f07536638ddf18"],
        ["nicole-demara", "https://act-upload.hoyoverse.com/event-ugc-hoyowiki/2026/04/14/98205622/0d56606a746c3365983e8b641469ba10_1830848742467791339.png"],
        ["grace-howard", "https://cdn.oneesports.gg/cdn-data/2024/07/ZenlessZoneZero_Agent_GraceHoward.jpg"],
        ["alexandrina-sebastiane", "https://zenless-zone-zero.gamemeta.ru/upload/resize_cache/iblock/5c6/kk2ow7uay8qtbuwl5bl8gn885gvc9uzd/1000_1000_1619711fa078991f0a23d032687646b21/5861537250d67fe4adcdc86009150c67_8472512953737197419.png"],
        ["zhu-yuan", "https://api.hakush.in/zzz/UI/IconRoleCrop23.webp"],
        ["laevatain", "https://endfield.gg/wp-content/uploads/sites/38/2025/08/laevatain-arknight-endfield-icon.webp"]
    ];

    for (const [id, expectedUrl] of expectedImages) {
        assert.equal(getCharacter(id)?.imageUrl, expectedUrl, `imagem incorreta para ${id}`);
        assert.match(getCharacter(id).imageUrl, /^https:\/\//, `URL não HTTPS para ${id}`);
    }
});


test("aliases e nomes não apontam para personagens diferentes", () => {
    const ownerByAlias = new Map();

    for (const character of listCharacters()) {
        const terms = [character.id, character.name, ...character.aliases];
        for (const term of terms) {
            const normalized = term.normalize("NFD")
                .replace(/[\\u0300-\\u036f]/g, "")
                .toLocaleLowerCase("pt-BR")
                .trim();
            const previousOwner = ownerByAlias.get(normalized);
            assert.ok(
                previousOwner === undefined || previousOwner === character.id,
                `alias duplicado "${term}" entre ${previousOwner} e ${character.id}`
            );
            ownerByAlias.set(normalized, character.id);
        }
    }
});

