// Adaptador de personagens: mantém o catálogo e o armazenamento independentes do provedor.
// Importar groq.js inicializa e registra as integrações já existentes antes do primeiro uso.
import "./groq.js";
import { aiProviderManager } from "./providerManager.js";

const DEFAULT_MODEL = "openai/gpt-oss-120b";

export async function generateCharacterReply(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new TypeError("A lista de mensagens para a IA está vazia.");
    }

    const response = await aiProviderManager.complete({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        messages,
        temperature: 0.9,
        max_tokens: 1200,
        reasoning_effort: "low",
    });

    const answer = response?.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("A IA não retornou uma resposta válida.");
    return answer;
}
