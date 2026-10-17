# Integrações de IA

O bot mantém apenas três integrações externas: Groq diretamente, Portkey como router de IA e Tavily para pesquisa web. As chaves ficam somente no arquivo .env local do Termux. Nunca publique nem compartilhe esse arquivo.

## Configuração

| Serviço | Variável | Uso |
| --- | --- | --- |
| Groq direto | GROQ_API_KEY | Acesso direto à API da Groq |
| Modelo Groq | GROQ_MODEL | Padrão: openai/gpt-oss-120b |
| Portkey router | PORTKEY_API_KEY | Chave da API do Portkey |
| Modelo Portkey | PORTKEY_MODEL | Modelo/rota disponível na sua configuração do Portkey |
| Endpoint Portkey | PORTKEY_BASE_URL | Padrão: https://api.portkey.ai/v1 |
| Provedor Portkey | PORTKEY_PROVIDER | Padrão: groq; ajuste ao identificador da integração configurada no Portkey |
| Pesquisa Tavily | TAVILY_API_KEY | Pesquisa web usada pela IA quando necessário |

A ordem padrão é AI_PROVIDER_ORDER=groq,portkey. Para tentar primeiro o router, use AI_PROVIDER_ORDER=portkey,groq. Cada rota precisa estar corretamente configurada na sua conta. O fallback não contorna limites nem permissões.

## Ajustes opcionais

    AI_CONCURRENCY=2
    AI_QUEUE_MAX=100
    AI_TIMEOUT_MS=30000
    AI_RETRIES=2

## Testes

    npm run test:ai
    node --test tests/openAICompatibleProvider.test.js
