/**
 * Describes the architecture of the Node.js runtime, not just the CPU.
 * Android may run a 32-bit userspace on a 64-bit-capable ARMv8 processor.
 */
export function getRuntimeProfile(arch = process.arch) {
    const normalized = String(arch || "").toLowerCase();

    if (normalized === "arm") {
        return { arch: normalized, profile: "v7", bits: 32, tier: "compat",
            description: "ARM 32-bit: use compatible dependencies and fallbacks" };
    }
    if (normalized === "arm64") {
        return { arch: normalized, profile: "v8", bits: 64, tier: "advanced",
            description: "ARM 64-bit: optional advanced backends may be available" };
    }
    if (["ia32", "x32"].includes(normalized)) {
        return { arch: normalized, profile: "other-32", bits: 32, tier: "compat",
            description: "32-bit runtime: prefer compatible dependencies and fallbacks" };
    }
    return { arch: normalized || "unknown", profile: "other-64", bits: 64, tier: "advanced",
        description: "Non-ARM or unrecognized runtime: probe optional backends at runtime" };
}

export function getRuntimeProfileSummary(arch = process.arch) {
    const profile = getRuntimeProfile(arch);
    return `[Chiru runtime] ${profile.profile} | ${profile.bits}-bit | Node arch=${profile.arch} | tier=${profile.tier}`;
}
