import assert from "node:assert/strict";
import test from "node:test";
import { buildGifPlaybackArgs } from "../src/services/gif.js";

test("usa seis segundos por padrão e gera vídeo compatível com GIF do WhatsApp", () => {
    const input = "/tmp/video de entrada.mp4";
    const output = "/tmp/gif de saída.mp4";
    const args = buildGifPlaybackArgs(input, output);

    assert.equal(args[args.indexOf("-i") + 1], input);
    assert.equal(args[args.indexOf("-t") + 1], "6");
    assert.equal(args[args.indexOf("-c:v") + 1], "libx264");
    assert.equal(args[args.indexOf("-vf") + 1],
        "fps=12,scale=480:480:force_original_aspect_ratio=decrease:flags=lanczos");
    assert.ok(args.includes("-an"));
    assert.equal(args.at(-1), output);
});

test("aceita uma duração personalizada dentro do limite", () => {
    const args = buildGifPlaybackArgs("entrada.mp4", "saida.mp4", 4);
    assert.equal(args[args.indexOf("-t") + 1], "4");
});

test("rejeita durações fora do intervalo de 1 a 6 segundos", () => {
    for (const duration of [0, 7, -1, 1.5, "abc"]) {
        assert.throws(
            () => buildGifPlaybackArgs("entrada.mp4", "saida.mp4", duration),
            RangeError
        );
    }
});

test("mantém caminhos com caracteres especiais como argumentos separados", () => {
    const input = "/tmp/video; echo nao-executar.mp4";
    const output = "/tmp/gif com espaços.mp4";
    const args = buildGifPlaybackArgs(input, output, 3);

    assert.equal(args[args.indexOf("-i") + 1], input);
    assert.equal(args.at(-1), output);
});
