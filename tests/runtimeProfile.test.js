import test from "node:test";
import assert from "node:assert/strict";
import { getRuntimeProfile, getRuntimeProfileSummary } from "../src/services/runtimeProfile.js";

test("detects ARMv7 Node runtimes as 32-bit compatibility profile", () => {
    assert.deepEqual(getRuntimeProfile("arm"), {
        arch: "arm", profile: "v7", bits: 32, tier: "compat",
        description: "ARM 32-bit: use compatible dependencies and fallbacks"
    });
});

test("detects ARMv8 Node runtimes as 64-bit advanced profile", () => {
    assert.deepEqual(getRuntimeProfile("arm64"), {
        arch: "arm64", profile: "v8", bits: 64, tier: "advanced",
        description: "ARM 64-bit: optional advanced backends may be available"
    });
});

test("does not mistake x64 for ARMv8", () => {
    const profile = getRuntimeProfile("x64");
    assert.equal(profile.profile, "other-64");
    assert.equal(profile.bits, 64);
});

test("detects non-ARM 32-bit runtimes safely", () => {
    assert.equal(getRuntimeProfile("ia32").bits, 32);
    assert.equal(getRuntimeProfile("ia32").tier, "compat");
});

test("runtime summary reports the actual Node architecture", () => {
    assert.match(getRuntimeProfileSummary("arm"), /v7 \| 32-bit \| Node arch=arm/);
});
