// OpenAI-compatible provider adapters. Keys are read only from process.env.
// Providers are registered only when their own API key is present.
const PROVIDERS = [
    {
        name: "gemini",
        key: "GEMINI_API_KEY",
        modelKey: "GEMINI_MODEL",
        defaultModel: "gemini-2.5-flash",
        baseURLKey: "GEMINI_BASE_URL",
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    },
    {
        name: "cerebras",
        key: "CEREBRAS_API_KEY",
        modelKey: "CEREBRAS_MODEL",
        defaultModel: "gpt-oss-120b",
        baseURLKey: "CEREBRAS_BASE_URL",
        baseURL: "https://api.cerebras.ai/v1",
    },
    {
        name: "mistral",
        key: "MISTRAL_API_KEY",
        modelKey: "MISTRAL_MODEL",
        defaultModel: "mistral-small-latest",
        baseURLKey: "MISTRAL_BASE_URL",
        baseURL: "https://api.mistral.ai/v1",
    },
    {
        name: "openrouter",
        key: "OPENROUTER_API_KEY",
        modelKey: "OPENROUTER_MODEL",
        defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
        baseURLKey: "OPENROUTER_BASE_URL",
        baseURL: "https://openrouter.ai/api/v1",
    },
    {
        name: "huggingface",
        key: "HF_TOKEN",
        modelKey: "HF_MODEL",
        defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
        baseURLKey: "HF_BASE_URL",
        baseURL: "https://router.huggingface.co/v1",
    },
    {
        name: "sambanova",
        key: "SAMBANOVA_API_KEY",
        modelKey: "SAMBANOVA_MODEL",
        defaultModel: "Meta-Llama-3.3-70B-Instruct",
        baseURLKey: "SAMBANOVA_BASE_URL",
        baseURL: "https://api.sambanova.ai/v1",
    },
    {
        name: "nvidia",
        key: "NVIDIA_API_KEY",
        modelKey: "NVIDIA_MODEL",
        defaultModel: "meta/llama-3.3-70b-instruct",
        baseURLKey: "NVIDIA_BASE_URL",
        baseURL: "https://integrate.api.nvidia.com/v1",
    },
    {
        name: "deepinfra",
        key: "DEEPINFRA_API_KEY",
        modelKey: "DEEPINFRA_MODEL",
        defaultModel: "meta-llama/Meta-Llama-3.3-70B-Instruct",
        baseURLKey: "DEEPINFRA_BASE_URL",
        baseURL: "https://api.deepinfra.com/v1/openai",
    },
    {
        name: "fireworks",
        key: "FIREWORKS_API_KEY",
        modelKey: "FIREWORKS_MODEL",
        defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
        baseURLKey: "FIREWORKS_BASE_URL",
        baseURL: "https://api.fireworks.ai/inference/v1",
    },
    {
        name: "together",
        key: "TOGETHER_API_KEY",
        modelKey: "TOGETHER_MODEL",
        defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        baseURLKey: "TOGETHER_BASE_URL",
        baseURL: "https://api.together.xyz/v1",
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
                ...(providerName === "openrouter" ? {
                    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://github.com/chirusanrestart/chiru-san-bot",
                    "X-Title": "Chiru-san Bot",
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
