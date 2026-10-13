// Official OpenAI API adapter. No key is read from source code or logged.
export function createOpenAIProvider({
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_MODEL || "gpt-4.1-mini",
    baseURL = "https://api.openai.com/v1",
} = {}) {
    if (!apiKey?.trim()) return null;

    return async function openAICompletion(request, { signal } = {}) {
        const { reasoning_effort: _reasoningEffort, ...compatibleRequest } = request;
        const response = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            signal,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ ...compatibleRequest, model }),
        });

        if (!response.ok) {
            const error = new Error(`OpenAI request failed with HTTP ${response.status}`);
            error.status = response.status;
            error.code = response.status === 429 ? "rate_limit_exceeded" : "provider_http_error";
            const retryAfter = response.headers.get("retry-after");
            if (retryAfter) error.headers = { "retry-after": retryAfter };
            throw error;
        }
        return response.json();
    };
}
