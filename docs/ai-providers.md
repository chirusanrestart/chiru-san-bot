# Provedores de IA

O gerenciador em `src/ai/providerManager.js` mantém fila limitada, concorrência, timeout, tentativas limitadas e fallback. O adaptador `src/ai/providers/openaiCompatible.js` adiciona provedores compatíveis com a API Chat Completions.

## Configuração

As chaves ficam apenas no `.env` local do Termux. Não compartilhe esse arquivo e nunca cole os valores em mensagens ou logs. Configure apenas os serviços em que você criou uma chave.

| Provedor | Variável da chave | Variável do modelo |
| --- | --- | --- |
| Groq (existente) | `GROQ_API_KEY` | modelo definido pela integração atual |
| Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` |
| Cerebras | `CEREBRAS_API_KEY` | `CEREBRAS_MODEL` |
| Mistral | `MISTRAL_API_KEY` | `MISTRAL_MODEL` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` |
| Hugging Face | `HF_TOKEN` | `HF_MODEL` |
| SambaNova | `SAMBANOVA_API_KEY` | `SAMBANOVA_MODEL` |
| NVIDIA | `NVIDIA_API_KEY` | `NVIDIA_MODEL` |
| DeepInfra | `DEEPINFRA_API_KEY` | `DEEPINFRA_MODEL` |
| Fireworks | `FIREWORKS_API_KEY` | `FIREWORKS_MODEL` |
| Together AI | `TOGETHER_API_KEY` | `TOGETHER_MODEL` |
| OpenAI (adaptador existente) | `OPENAI_API_KEY` | `OPENAI_MODEL` |

Os modelos padrão são sugestões de partida, não garantia de disponibilidade ou gratuidade. Modelos, preços, cotas e compatibilidade de ferramentas mudam. Se um modelo retornar erro de requisição, ajuste a variável de modelo para uma opção atualmente disponível na conta.

Opcionalmente, altere o endpoint com `GEMINI_BASE_URL`, `CEREBRAS_BASE_URL`, `MISTRAL_BASE_URL`, `OPENROUTER_BASE_URL`, `HF_BASE_URL`, `SAMBANOVA_BASE_URL`, `NVIDIA_BASE_URL`, `DEEPINFRA_BASE_URL`, `FIREWORKS_BASE_URL` ou `TOGETHER_BASE_URL`.

A ordem é controlada por `AI_PROVIDER_ORDER`, por exemplo:

```env
AI_PROVIDER_ORDER=groq,gemini,cerebras,mistral,openrouter,huggingface,sambanova,nvidia,deepinfra,fireworks,together,openai
AI_CONCURRENCY=2
AI_QUEUE_MAX=100
AI_TIMEOUT_MS=30000
AI_RETRIES=1
```

O gerenciador ignora provedores sem chave registrada. A ordem não cria contas nem contorna limites. Use somente cotas e credenciais permitidas pelos termos de cada serviço. O uso de agregadores não significa que todas as rotas/modelos sejam gratuitos.

## Testes

```bash
npm run test:ai
node --test tests/openAICompatibleProvider.test.js
```
