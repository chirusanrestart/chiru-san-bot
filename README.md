# Chiru-san Bot

Bot de WhatsApp feito em Node.js usando Baileys.

## Requisitos

- Node.js
- FFmpeg
- Uma conta do WhatsApp

## Instalação

```bash
git clone https://github.com/chirusanrestart/chiru-san-bot.git
cd chiru-san-bot
npm install
```

Configure as variáveis de ambiente necessárias e depois inicie:

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

A sessão do WhatsApp é armazenada em `auth/`.

## Observação

Este é um projeto pessoal do Chiru-san.