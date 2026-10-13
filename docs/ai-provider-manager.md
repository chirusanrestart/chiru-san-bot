# Gerenciador de provedores de IA

## Variáveis de ambiente

| Variável | Padrão | Uso |
| --- | --- | --- |
| `AI_PROVIDER_ORDER` | `groq,openai` | Ordem explícita de provedores habilitados |
| `AI_CONCURRENCY` | `2` | Chamadas simultâneas |
| `AI_QUEUE_MAX` | `100` | Tamanho máximo da fila pendente |
| `AI_TIMEOUT_MS` | `30000` | Timeout por tentativa |
| `AI_RETRIES` | `2` | Repetições por provedor, de 0 a 5 |
| `AI_RETRY_BASE_MS` | `500` | Espera inicial exponencial |
| `AI_RETRY_MAX_MS` | `8000` | Espera máxima |
| `OPENAI_API_KEY` | vazio | Credencial opcional do provedor OpenAI oficial |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Modelo OpenAI habilitado na conta |

`GROQ_API_KEY` continua sendo a credencial do adaptador Groq existente. Configure somente chaves às quais você tem autorização de uso. Não coloque segredos no Git.

## Uso

O gerenciador é independente do bot e de personagens:

```js
import { aiProviderManager } from "./providerManager.js";

aiProviderManager.registerProvider("my-provider", async (request, { signal }) => {
    // Chame aqui um provedor oficial e autorizado.
    // Passe signal para suportar cancelamento/timeout.
    return await client.chat.completions.create(request, { signal });
});

const response = await aiProviderManager.complete({
    model: "modelo-configurado",
    messages: [{ role: "user", content: "Olá" }],
});
```

O adaptador OpenAI pode ser criado com `createOpenAIProvider()` de `src/ai/providers/openai.js`; ele retorna `null` se `OPENAI_API_KEY` não estiver configurada.

## Testes

Execute `node --test tests/aiProviderManager.test.js`. Os testes cobrem concorrência, timeout com fallback, HTTP 429 com tentativas limitadas, ausência de provedores e falha de autenticação.

## Métricas

`aiProviderManager.getMetrics()` fornece contadores agregados, duração, fila, concorrência ativa e contadores por provedor. Não inclui mensagens, prompts, respostas ou credenciais.
