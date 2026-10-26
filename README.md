# Chiru-san Bot 🌸

Bot de WhatsApp desenvolvido em **Node.js** com Baileys, comandos personalizados, inteligência artificial, conversas com personagens e ferramentas para mídia e figurinhas.

## ✨ Funcionalidades

- 💬 Comandos de WhatsApp com prefixo `. `.replace(" ", "")`
- 🤖 Conversas com IA e personagens configuráveis
- 🧠 Histórico e memória organizados por usuário, conversa e personagem
- 🎭 Seleção e criação de personagens
- 🎨 Criação, conversão e envio de figurinhas
- 📦 Criação e envio de pacotes de figurinhas
- 🎬 Processamento de mídia com FFmpeg
- 🔎 Recursos de pesquisa e obtenção de mídia
- 🔌 Integração com provedores de IA compatíveis, incluindo Groq e Portkey
- 🌐 Pesquisa na web por meio do Tavily

> Os recursos disponíveis podem variar conforme a configuração local, as dependências e as chaves de API configuradas.

## 📋 Requisitos

- Node.js compatível com as dependências do projeto
- npm
- FFmpeg para recursos de mídia/figurinhas que dependem dele
- Uma conta do WhatsApp
- Chaves de API para os serviços externos que você decidir utilizar

**O yt-dlp é opcional.** O bot inicia normalmente sem ele. Recursos de download que tenham uma API compatível podem usá-la sem depender do yt-dlp; os recursos que precisem exclusivamente do executável local não estarão disponíveis se ele estiver ausente. O bot não deve tentar instalar essa ferramenta automaticamente.

## 🚀 Instalação

```bash
git clone https://github.com/chirusanrestart/chiru-san-bot.git
cd chiru-san-bot
npm install
```

Crie sua configuração local com base no modelo disponível, quando aplicável:

```bash
cp .env.example .env
```

Edite o arquivo `.env` e preencha apenas as variáveis necessárias para os recursos que pretende usar. Não publique chaves reais.

Inicie o bot:

```bash
npm start
```

Na primeira execução, siga as instruções exibidas no terminal para conectar sua conta do WhatsApp.

## 🕹️ Exemplos de comandos

Os comandos usam o prefixo `.`. Alguns exemplos:

```text
.menu
.ia
.personagens
.personagem Furina
.falar Oi!
.novaconversa
.pack Furina
```

Use `.menu` no próprio bot para consultar os comandos disponíveis na versão instalada.

## 🎭 Conversas com personagens

- `.personagens`: mostra os personagens configurados.
- `.personagem NOME`: seleciona um personagem por nome, ID ou alias.
- `.falar MENSAGEM`: conversa com o personagem selecionado.
- `.novaconversa`: inicia uma nova sessão para o personagem atual.

Os personagens são definidos em `src/ai/characters.js`. A configuração de provedores de IA está documentada em `docs/ai-providers.md`, e o arquivo `.env.example` serve como referência para as variáveis necessárias.

## 🧪 Testes

O projeto inclui testes automatizados. Alguns comandos disponíveis são:

```bash
npm run check:syntax
npm run test:ai
npm run test:memory
npm run test:characters
```

## 🔐 Privacidade e segurança

- Mantenha o arquivo `.env`, a pasta `auth/`, cookies, sessões e dados de conversas apenas no ambiente local.
- Nunca envie chaves de API ou credenciais para commits públicos.
- A memória e o histórico locais podem conter informações privadas. Proteja os arquivos e faça cópias de segurança com cuidado.
- Se uma chave real for publicada acidentalmente, revogue-a no serviço correspondente e gere outra.

## 🗂️ Estrutura

O código principal fica em `src/`, dividido em comandos, serviços e módulos de IA. Arquivos locais de autenticação e dados são mantidos separados do código versionado.

## 📱 Termux

O projeto pode ser executado em ambientes Android com Termux, desde que a versão do Node.js, as dependências nativas e os utilitários necessários sejam compatíveis com o dispositivo. Alguns recursos podem exigir ajustes específicos.

## 📄 Licença e créditos

Projeto pessoal desenvolvido por **Chiru-san**. Consulte os arquivos do repositório e as licenças das dependências utilizadas antes de redistribuir componentes.

---
Se encontrar um problema, confira os logs do terminal e abra uma issue com os detalhes relevantes. **Não inclua tokens, chaves, números privados ou arquivos de sessão.**
