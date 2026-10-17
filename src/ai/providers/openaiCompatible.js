// OpenAI-compatible provider adapters. Keys are read only from process.env.
// Providers are registered only when their own API key is present.
const PROVIDERS = [
    {
        name: "portkey",
        key: "PORTKEY_API_KEY",
        modelKey: "PORTKEY_MODEL",
        defaultModel: "openai/gpt-oss-120b",
        baseURLKey: "PORTKEY_BASE_URL",
        baseURL: "https://api.portkey.ai/v1",
    },
];

function cleanBaseURL(value) {
    return String(value || "").trim().replace(/\/+$/, "");
}

export function getConfiguredProviderNames(env = process.env) {
    return PROVIDERS
        .filter(provider => typeof env[provider.key] === "string" && env[provider.key].trim())
        .map(provider => provider.name);
}

export function createOpenAICompatibleProvider({
    apiKey,
    model,
    baseURL,
    providerName = "provider",
    fetchImpl = globalThis.fetch,
} = {}) {
    if (!apiKey?.trim()) return null;
    if (typeof fetchImpl !== "function") {
        throw new TypeError("Este Node.js não disponibiliza fetch; atualize para uma versão LTS suportada.");
    }
    const endpoint = `${cleanBaseURL(baseURL)}/chat/completions`;

    return async function complete(request, { signal } = {}) {
        if (!model?.trim()) {
            const error = new Error(`Modelo não configurado para o provedor ${providerName}.`);
            error.code = "AI_MODEL_NOT_CONFIGURED";
            throw error;
        }

        // These fields are not consistently accepted by OpenAI-compatible APIs.
        const { reasoning_effort: _reasoningEffort, parallel_tool_calls: _parallelToolCalls, ...compatibleRequest } = request || {};
        const response = await fetchImpl(endpoint, {
            method: "POST",
            signal,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                ...(providerName === "portkey" ? {
                    "x-portkey-provider": process.env.PORTKEY_PROVIDER || "groq",
                } : {}),
            },
            body: JSON.stringify({ ...compatibleRequest, model }),
        });

        if (!response.ok) {
            const error = new Error(`${providerName} request failed with HTTP ${response.status}`);
            error.status = response.status;
            error.code = response.status === 429 ? "rate_limit_exceeded" : "provider_http_error";
            const retryAfter = response.headers?.get?.("retry-after");
            if (retryAfter) error.headers = { "retry-after": retryAfter };
            throw error;
        }
        return response.json();
    };
}

export function registerConfiguredProviders(manager, env = process.env) {
    const registered = [];
    for (const definition of PROVIDERS) {
        const apiKey = env[definition.key];
        if (typeof apiKey !== "string" || !apiKey.trim()) continue;

        const handler = createOpenAICompatibleProvider({
            apiKey,
            model: env[definition.modelKey] || definition.defaultModel,
            baseURL: env[definition.baseURLKey] || definition.baseURL,
            providerName: definition.name,
        });
        if (!handler) continue;
        manager.registerProvider(definition.name, handler);
        registered.push(definition.name);
    }
    return registered;
}
