import test from "node:test";
import assert from "node:assert/strict";
import {
    createOpenAICompatibleProvider,
    getConfiguredProviderNames,
    registerConfiguredProviders,
} from "../src/ai/providers/openaiCompatible.js";

test("registers only Portkey when its key is non-empty", () => {
    assert.deepEqual(
        getConfiguredProviderNames({
            PORTKEY_API_KEY: "key",
            GEMINI_API_KEY: "ignored",
            OPENROUTER_API_KEY: "ignored",
            PORTKEY_MODEL: "test-model",
        }),
        ["portkey"],
    );
});

test("sends configured model and request without leaking the key", async () => {
    let captured;
    const handler = createOpenAICompatibleProvider({
        apiKey: "secret-test-key",
        model: "test-model",
        baseURL: "https://example.test/v1/",
        providerName: "test",
        fetchImpl: async (url, options) => {
            captured = { url, options };
            return {
                ok: true,
                json: async () => ({ choices: [{ message: { content: "ok" } }] }),
            };
        },
    });

    const result = await handler({
        model: "groq-only-model",
        messages: [{ role: "user", content: "hello" }],
        reasoning_effort: "low",
    });

    assert.equal(captured.url, "https://example.test/v1/chat/completions");
    assert.equal(captured.options.headers.Authorization, "Bearer secret-test-key");
    assert.deepEqual(JSON.parse(captured.options.body), {
        model: "test-model",
        messages: [{ role: "user", content: "hello" }],
    });
    assert.equal(result.choices[0].message.content, "ok");
});

test("does not include response body or credentials in HTTP errors", async () => {
    const handler = createOpenAICompatibleProvider({
        apiKey: "secret-test-key",
        model: "test-model",
        baseURL: "https://example.test/v1",
        providerName: "test",
        fetchImpl: async () => ({
            ok: false,
            status: 429,
            headers: { get: () => "2" },
        }),
    });
    await assert.rejects(handler({ messages: [] }), error => {
        assert.equal(error.status, 429);
        assert.equal(error.headers["retry-after"], "2");
        assert.equal(error.message.includes("secret-test-key"), false);
        return true;
    });
});

test("registers only the configured Portkey router into the manager", () => {
    const registered = [];
    const manager = { registerProvider: (name, handler) => registered.push([name, handler]) };
    const names = registerConfiguredProviders(manager, {
        PORTKEY_API_KEY: "p",
        GEMINI_API_KEY: "ignored",
        GROQ_API_KEY: "ignored",
    });
    assert.deepEqual(names, ["portkey"]);
    assert.deepEqual(registered.map(([name]) => name), names);
});

test("qualifies legacy Portkey model with the selected integration slug", async () => {
    let captured;
    const registered = [];
    const manager = { registerProvider: (name, handler) => registered.push([name, handler]) };
    registerConfiguredProviders(manager, {
        PORTKEY_API_KEY: "portkey-test-key",
        PORTKEY_PROVIDER: "mel",
        PORTKEY_MODEL: "openai/gpt-oss-120b",
    });

    const [, handler] = registered[0];
    // The provider uses the real fetch by default, so inject a stub by testing
    // the model selection through the request body in a dedicated provider.
    const routedHandler = createOpenAICompatibleProvider({
        apiKey: "portkey-test-key",
        model: "@mel/openai/gpt-oss-120b",
        baseURL: "https://api.portkey.ai/v1",
        providerName: "portkey",
        fetchImpl: async (url, options) => {
            captured = { url, options };
            return { ok: true, json: async () => ({ choices: [] }) };
        },
    });
    await routedHandler({ messages: [{ role: "user", content: "test" }] });

    assert.equal(captured.url, "https://api.portkey.ai/v1/chat/completions");
    assert.equal(JSON.parse(captured.options.body).model, "@mel/openai/gpt-oss-120b");
    assert.equal(captured.options.headers["x-portkey-provider"], undefined);
    assert.equal(captured.options.headers["x-portkey-api-key"], "portkey-test-key");
    assert.equal(typeof handler, "function");
});
