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

O arquivo `.env` já faz parte do repositório e contém as configurações usadas pelo bot. Se precisar alterar as chaves, edite `.env` e faça commit. Depois inicie:

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

- 🤖 Comandos para WhatsApp
- 🧠 IA
- 🎨 Criação e envio de figurinhas
- 📦 Packs de figurinhas
- 🖼️ Auto-sticker em grupos
- 🎬 Processamento de mídia com FFmpeg
- 🔎 Pesquisa e download de conteúdo

## Estrutura

O código principal fica em `src/`, com comandos e serviços separados por função.

A sessão do WhatsApp é armazenada em `auth/`. A memória da IA é criada localmente em `src/data/memory.json` quando necessária.

**Privacidade:** a sessão do WhatsApp, cookies, credenciais e arquivos de memória/conversas continuam fora do Git. O `.env` é uma exceção intencional deste projeto e permanece versionado.

## Observação

Este é um projeto pessoal do Chiru-san.