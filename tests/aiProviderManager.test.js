import test from "node:test";
import assert from "node:assert/strict";
import { createAIProviderManager } from "../src/ai/providerManager.js";

const fast = { concurrency: 1, maxQueue: 5, timeoutMs: 30, retries: 0, baseDelayMs: 1, maxDelayMs: 2, providerOrder: ["primary", "backup"] };

test("serializes requests according to configured concurrency", async () => {
    const manager = createAIProviderManager({ ...fast, concurrency: 1 });
    let active = 0;
    let peak = 0;
    manager.registerProvider("primary", async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 10));
        active--;
        return "ok";
    });
    const values = await Promise.all([manager.complete({}), manager.complete({}), manager.complete({})]);
    assert.deepEqual(values, ["ok", "ok", "ok"]);
    assert.equal(peak, 1);
});

test("times out a provider call and falls back", async () => {
    const manager = createAIProviderManager({ ...fast, timeoutMs: 15 });
    manager.registerProvider("primary", () => new Promise(() => {}));
    manager.registerProvider("backup", async () => "backup-result");
    assert.equal(await manager.complete({}), "backup-result");
    assert.equal(manager.getMetrics().timedOut, 1);
    assert.equal(manager.getMetrics().fallbacks, 1);
});

test("classifies rate limit and falls back without unbounded retries", async () => {
    const manager = createAIProviderManager({ ...fast, retries: 1, baseDelayMs: 1, maxDelayMs: 2 });
    let calls = 0;
    manager.registerProvider("primary", async () => {
        calls++;
        const error = new Error("limited");
        error.status = 429;
        throw error;
    });
    manager.registerProvider("backup", async () => "ok");
    assert.equal(await manager.complete({}), "ok");
    assert.equal(calls, 2);
    assert.equal(manager.getMetrics().rateLimited, 2);
    assert.equal(manager.getMetrics().retries, 1);
});

test("fails clearly when no provider is available", async () => {
    const manager = createAIProviderManager({ ...fast, providerOrder: ["missing"] });
    await assert.rejects(manager.complete({}), /No configured AI provider/);
    assert.equal(manager.getMetrics().failed, 1);
});

test("does not fallback on invalid credentials", async () => {
    const manager = createAIProviderManager({ ...fast });
    let backupCalls = 0;
    manager.registerProvider("primary", async () => {
        const error = new Error("unauthorized");
        error.status = 401;
        throw error;
    });
    manager.registerProvider("backup", async () => { backupCalls++; return "bad"; });
    await assert.rejects(manager.complete({}), /unauthorized/);
    assert.equal(backupCalls, 0);
});
