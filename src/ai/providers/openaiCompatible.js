// OpenAI-compatible provider adapters. Keys are read only from process.env.
// Providers are registered only when their own API key is present.
const PROVIDERS = [
    {
        name: "portkey",
        key: "PORTKEY_API_KEY",
        modelKey: "PORTKEY_MODEL",
        baseURLKey: "PORTKEY_BASE_URL",
        baseURL: "https://api.portkey.ai/v1",
    },
];

function cleanBaseURL(value) {
    return String(value || "").trim().replace(/\/+$/, "");
}

function getPortkeyModel(env) {
    const configuredModel = String(env.PORTKEY_MODEL || "").trim();
    const slug = String(env.PORTKEY_PROVIDER || "").trim().replace(/^@/, "");

    // A Model Catalog reference already contains its provider slug.
    if (configuredModel.startsWith("@")) return configuredModel;

    // PORTKEY_MODEL in older .env files may still be "openai/gpt-oss-120b".
    // When a catalog slug is configured, qualify that model instead of silently
    // bypassing the selected integration.
    if (slug) return `@${slug}/${configuredModel || "openai/gpt-oss-120b"}`;

    return configuredModel || "openai/gpt-oss-120b";
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
    configId,
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
        const headers = {
            "x-portkey-api-key": apiKey,
            "Content-Type": "application/json",
        };

        if (providerName === "portkey") {
            const resolvedConfigId = String(configId || process.env.PORTKEY_CONFIG_ID || "").trim();
            const providerSlug = String(process.env.PORTKEY_PROVIDER || "").trim().replace(/^@/, "");

            // Portkey requires either x-portkey-config or x-portkey-provider.
            // Prefer a saved Gateway Config (for example, a load-balancing config).
            // Otherwise, always send the provider header, including when the model
            // uses a Model Catalog reference such as @mel/openai/gpt-oss-120b.
            if (resolvedConfigId) {
                headers["x-portkey-config"] = resolvedConfigId;
            } else if (providerSlug) {
                headers["x-portkey-provider"] = providerSlug;
            } else {
                const error = new Error(
                    "Portkey precisa de PORTKEY_CONFIG_ID (Gateway Config) ou PORTKEY_PROVIDER (slug do provedor) no .env.",
                );
                error.code = "PORTKEY_ROUTING_NOT_CONFIGURED";
                throw error;
            }
        } else {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetchImpl(endpoint, {
            method: "POST",
            signal,
            headers,
            body: JSON.stringify({ ...compatibleRequest, model }),
        });

        if (!response.ok) {
            let details = "";
            try {
                const body = await response.text();
                if (body) {
                    try {
                        const parsed = JSON.parse(body);
                        details = parsed?.error?.message || parsed?.message || body;
                    } catch {
                        details = body;
                    }
                }
            } catch {
                // Keep the HTTP status even if the response body cannot be read.
            }

            const suffix = details ? `: ${String(details).slice(0, 1200)}` : "";
            const error = new Error(`${providerName} request failed with HTTP ${response.status}${suffix}`);
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
            model: definition.name === "portkey"
                ? getPortkeyModel(env)
                : env[definition.modelKey] || "openai/gpt-oss-120b",
            baseURL: env[definition.baseURLKey] || definition.baseURL,
            providerName: definition.name,
            configId: env.PORTKEY_CONFIG_ID,
        });
        if (!handler) continue;
        manager.registerProvider(definition.name, handler);
        registered.push(definition.name);
    }
    return registered;
}
