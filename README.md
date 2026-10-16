# Chiru-san Bot

Bot de WhatsApp feito em Node.js usando Baileys.

## Requisitos

- Node.js
- FFmpeg
- `yt-dlp` (com suporte a download e pós-processamento)
- Uma conta do WhatsApp

## Instalação

```bash
git clone https://github.com/chirusanrestart/chiru-san-bot.git
cd chiru-san-bot
npm install
```

Configure suas chaves localmente no arquivo `.env` e nunca publique chaves reais no Git. Depois inicie:

```bash
npm start
```

Na primeira execução, o bot pede o número do WhatsApp e gera um código de pareamento.

## Comandos

Os comandos usam o prefixo `.`.

Exemplos:

```
.menu
.ia
.hd
.encurtar
.nord
.pack Furina
```

## Recursos

- 🎭 Conversas com personagens configuráveis, histórico isolado por usuário/chat/personagem e persistência local
- 🤖 Comandos para WhatsApp
- 🧠 IA
- 🎨 Criação e envio de figurinhas
- 📦 Packs de figurinhas
- 🖼️ Auto-sticker em grupos
- 🎬 Processamento de mídia com FFmpeg
- 🔎 Pesquisa e download de conteúdo

## Estrutura

O código principal fica em `src/`, com comandos e serviços separados por função.

A sessão do WhatsApp é armazenada em `auth/`. A memória da IA geral fica em `src/data/memory.json`; o histórico de personagens fica em `src/data/character-chat.json`. Esses arquivos são locais e ignorados pelo Git.

**Privacidade:** a sessão do WhatsApp, cookies, credenciais e arquivos de memória/conversas ficam fora do Git. O `.env` também é ignorado pelo Git e deve permanecer apenas no ambiente local. Nunca versione chaves de API; se alguma chave real já foi publicada, revogue-a e gere outra.

## Conversas com personagens

- `.personagens`: lista os personagens configurados em `src/ai/characters.js`.
- `.personagem NOME`: seleciona um personagem pelo nome, ID ou alias.
- `.falar MENSAGEM` (alias `.conversar`): conversa com o personagem selecionado.
- `.novaconversa`: inicia uma sessão nova para o personagem atual.
- `.novaconversa limpar`: apaga o histórico de personagens do usuário em todos os chats, mantendo as seleções.

Para criar um personagem, adicione um objeto a `src/ai/characters.js` com `id`, `name`, `aliases`, `description` e `systemPrompt`. Não é necessário alterar os comandos nem o armazenamento. A camada `src/ai/characterProvider.js` usa o gerenciador modular em `src/ai/providerManager.js`, com fila, limites de concorrência, timeout, tentativas e fallback entre provedores configurados. As chaves opcionais e os ajustes ficam descritos em `docs/ai-providers.md` e `.env.example`.

O histórico é separado por usuário, chat, personagem e sessão. O armazenamento limita o contexto enviado à IA às últimas 12 mensagens, limita o texto de entrada e grava o arquivo com permissões restritas quando o sistema de arquivos permite.

Teste o isolamento com `node --test tests/characterStore.test.js`.

## Observação

Este é um projeto pessoal do Chiru-san.

### Pokémon para conversar

O catálogo de personagens inclui Pokémon com personalidades próprias e imagens de referência individuais. Use `.personagens` para ver o catálogo, `.personagem Eevee` (ou outro nome) para selecionar um Pokémon e ver sua imagem, e `.falar Oi!` para conversar. As imagens oficiais de Pokémon são carregadas do repositório público PokeAPI Sprites; se uma imagem falhar, a seleção continua funcionando em texto.
