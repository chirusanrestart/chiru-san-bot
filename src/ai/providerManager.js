import { registerConfiguredProviders } from "./providers/openaiCompatible.js";

const DEFAULTS = {
    concurrency: 2,
    maxQueue: 100,
    timeoutMs: 30000,
    retries: 2,
    baseDelayMs: 500,
    maxDelayMs: 8000,
};

const DEFAULT_PROVIDER_ORDER = ["groq", "portkey"];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function envInt(name, fallback, min = 1, max = 100000) {
    const value = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function classifyProviderError(error) {
    const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
    const code = String(error?.code ?? error?.error?.code ?? "").toLowerCase();

    if (error?.name === "AbortError" || error?.name === "TimeoutError" || code.includes("timeout")) {
        return { kind: "timeout", retryable: true, status: status || null };
    }
    if (status === 429 || code.includes("rate_limit") || code.includes("quota")) {
        return { kind: "rate_limit", retryable: true, status: status || 429 };
    }
    if (status === 408 || status === 425 || status >= 500 || ["econnreset", "econnrefused", "etimedout", "eai_again"].includes(code)) {
        return { kind: "temporary", retryable: true, status: status || null };
    }
    if (status === 401 || status === 403) {
        return { kind: "auth", retryable: false, status };
    }
    if (status >= 400 && status < 500) {
        return { kind: "request", retryable: false, status };
    }
    return { kind: "unknown", retryable: false, status: status || null };
}

export function createAIProviderManager(options = {}) {
    const configuredOrder = (process.env.AI_PROVIDER_ORDER || DEFAULT_PROVIDER_ORDER.join(","))
        .split(",").map(name => name.trim()).filter(Boolean);
    const config = {
        concurrency: options.concurrency ?? envInt("AI_CONCURRENCY", DEFAULTS.concurrency, 1, 32),
        maxQueue: options.maxQueue ?? envInt("AI_QUEUE_MAX", DEFAULTS.maxQueue, 1, 10000),
        timeoutMs: options.timeoutMs ?? envInt("AI_TIMEOUT_MS", DEFAULTS.timeoutMs, 1000, 300000),
        retries: options.retries ?? envInt("AI_RETRIES", DEFAULTS.retries, 0, 5),
        baseDelayMs: options.baseDelayMs ?? envInt("AI_RETRY_BASE_MS", DEFAULTS.baseDelayMs, 50, 60000),
        maxDelayMs: options.maxDelayMs ?? envInt("AI_RETRY_MAX_MS", DEFAULTS.maxDelayMs, 100, 120000),
        providerOrder: options.providerOrder ?? configuredOrder,
    };

    const providers = new Map();
    const queue = [];
    let active = 0;
    const metrics = {
        submitted: 0, succeeded: 0, failed: 0, timedOut: 0,
        rateLimited: 0, retries: 0, fallbacks: 0, queueRejected: 0,
        totalLatencyMs: 0, byProvider: {},
    };

    function registerProvider(name, handler, { enabled = true } = {}) {
        if (!name || typeof handler !== "function") throw new TypeError("Provider requires a name and handler.");
        providers.set(name, { handler, enabled });
    }

    function providerMetrics(name) {
        metrics.byProvider[name] ??= { requests: 0, successes: 0, failures: 0, latencyMs: 0 };
        return metrics.byProvider[name];
    }

    function drain() {
        while (active < config.concurrency && queue.length) {
            const job = queue.shift();
            active++;
            run(job).then(job.resolve, job.reject).finally(() => {
                active--;
                drain();
            });
        }
    }

    function enqueue(request, callOptions = {}) {
        if (queue.length >= config.maxQueue && active >= config.concurrency) {
            metrics.queueRejected++;
            return Promise.reject(Object.assign(new Error("AI request queue is full"), { code: "AI_QUEUE_FULL" }));
        }
        metrics.submitted++;
        return new Promise((resolve, reject) => {
            queue.push({ request, callOptions, resolve, reject, queuedAt: Date.now() });
            drain();
        });
    }

    async function run(job) {
        const startedAt = Date.now();
        const order = [...new Set(job.callOptions.providerOrder || config.providerOrder)];
        let lastError;
        let attemptedProviderCount = 0;

        try {
            for (const name of order) {
                const provider = providers.get(name);
                if (!provider?.enabled) continue;

                if (attemptedProviderCount > 0) metrics.fallbacks++;
                attemptedProviderCount++;

                const pm = providerMetrics(name);
                let attempt = 0;
                while (true) {
                    attempt++;
                    pm.requests++;
                    const controller = new AbortController();
                    let timedOut = false;
                    const timeout = setTimeout(() => {
                        timedOut = true;
                        controller.abort();
                    }, config.timeoutMs);
                    const externalSignal = job.callOptions.signal;
                    const abortExternal = () => controller.abort();
                    if (externalSignal) {
                        if (externalSignal.aborted) controller.abort();
                        else externalSignal.addEventListener("abort", abortExternal, { once: true });
                    }
                    const started = Date.now();

                    try {
                        const result = await Promise.race([
                            Promise.resolve().then(() => provider.handler(job.request, {
                                signal: controller.signal,
                                attempt,
                                provider: name,
                            })),
                            new Promise((_, reject) => {
                                controller.signal.addEventListener("abort", () => {
                                    const error = Object.assign(
                                        new Error(timedOut ? "AI provider timed out" : "AI request was aborted"),
                                        { name: timedOut ? "TimeoutError" : "AbortError", code: timedOut ? "AI_TIMEOUT" : "AI_ABORTED" },
                                    );
                                    reject(error);
                                }, { once: true });
                            }),
                        ]);
                        pm.successes++;
                        pm.latencyMs += Date.now() - started;
                        metrics.succeeded++;
                        return result;
                    } catch (error) {
                        lastError = error;
                        pm.failures++;
                        pm.latencyMs += Date.now() - started;
                        const classified = classifyProviderError(error);
                        if (classified.kind === "timeout") metrics.timedOut++;
                        if (classified.kind === "rate_limit") metrics.rateLimited++;

                        // A caller cancellation should never start retries or another provider.
                        if (error?.code === "AI_ABORTED" || externalSignal?.aborted) break;
                        if (!classified.retryable || attempt > config.retries) break;
                        metrics.retries++;
                        const retryAfterRaw = error?.headers?.["retry-after"] ?? error?.response?.headers?.["retry-after"];
                        const retryAfter = Number(retryAfterRaw);
                        const exponential = Math.min(config.maxDelayMs, config.baseDelayMs * (2 ** (attempt - 1)));
                        await sleep(Number.isFinite(retryAfter) && retryAfter > 0
                            ? Math.min(retryAfter * 1000, config.maxDelayMs)
                            : exponential);
                    } finally {
                        clearTimeout(timeout);
                        externalSignal?.removeEventListener("abort", abortExternal);
                    }
                }

                if (lastError?.code === "AI_ABORTED" || job.callOptions.signal?.aborted) break;
                // Do not retry invalid credentials against the same provider. An auth failure
                // may fall through to another provider, which uses its own independently configured key.
                const lastClassification = lastError ? classifyProviderError(lastError) : null;
                if (lastClassification && !lastClassification.retryable && lastClassification.kind !== "auth") break;
            }
            metrics.failed++;
            if (lastError) throw lastError;
            const error = new Error("No configured AI provider is available.");
            error.code = "AI_NOT_CONFIGURED";
            throw error;
        } finally {
            metrics.totalLatencyMs += Date.now() - startedAt;
        }
    }

    function getMetrics() {
        return {
            ...metrics,
            byProvider: Object.fromEntries(Object.entries(metrics.byProvider).map(([key, value]) => [key, { ...value }])),
            queueDepth: queue.length,
            active,
            config: { ...config, providerOrder: [...config.providerOrder] },
            providers: [...providers.entries()].map(([name, value]) => ({ name, enabled: value.enabled })),
        };
    }

    function hasAvailableProvider() {
        return config.providerOrder.some(name => providers.get(name)?.enabled);
    }

    return { registerProvider, complete: enqueue, getMetrics, hasAvailableProvider };
}

export const aiProviderManager = createAIProviderManager();
registerConfiguredProviders(aiProviderManager);
