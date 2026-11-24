import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { transcribeAudioFile } from "../src/ai/audioTranscription.js";

async function createAudioFixture(t) {
    const directory = await mkdtemp(path.join(tmpdir(), "chiru-audio-test-"));
    const filePath = path.join(directory, "sample.ogg");
    await writeFile(filePath, Buffer.from("audio fixture bytes"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return filePath;
}

function createTranscriptionClient(response, onRequest = () => {}) {
    return {
        audio: {
            transcriptions: {
                async create(request) {
                    onRequest(request);
                    const received = await readFile(request.file.path);
                    assert.equal(received.toString(), "audio fixture bytes");
                    return response;
                }
            }
        }
    };
}

test("uploads the audio file to Whisper Turbo and returns the trimmed transcript", async t => {
    const filePath = await createAudioFixture(t);
    let capturedRequest;

    const client = createTranscriptionClient(
        { text: "  mensagem transcrita  " },
        request => {
            capturedRequest = request;
        }
    );

    const transcript = await transcribeAudioFile(client, filePath);

    assert.equal(transcript, "mensagem transcrita");
    assert.equal(capturedRequest.model, "whisper-large-v3-turbo");
    assert.equal(capturedRequest.response_format, "json");
});

test("reports a clear error when no Groq client is configured", async () => {
    await assert.rejects(
        transcribeAudioFile(null, "./sample.ogg"),
        error => error.code === "GROQ_TRANSCRIPTION_NOT_CONFIGURED"
    );
});

test("rejects an empty transcription instead of sending an empty prompt to the chat model", async t => {
    const filePath = await createAudioFixture(t);
    const client = createTranscriptionClient({ text: "   " });

    await assert.rejects(
        transcribeAudioFile(client, filePath),
        /Whisper não retornou texto/
    );
});
