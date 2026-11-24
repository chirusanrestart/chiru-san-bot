# Conversão de vídeo em GIF no WhatsApp

## Intenção

Adicionar o comando `.togif` ao Chiru-san Bot para transformar um vídeo recebido ou citado em uma animação exibida no modo GIF do WhatsApp.

## Comportamento

- `.togif` responde a um vídeo citado ou funciona na legenda do próprio vídeo.
- `.togif N` aceita uma duração inteira de 1 a 6 segundos; o padrão é 6.
- O comando converte apenas o início do vídeo, remove o áudio e limita a imagem a 480 × 480 pixels com 12 quadros por segundo.
- O resultado é um MP4 H.264 enviado com `gifPlayback: true`, para que o WhatsApp o apresente como GIF animado.
- O arquivo de entrada tem limite de 64 MiB, validado antes e depois do download.
- Os arquivos temporários são removidos tanto em caso de sucesso quanto de falha.

## Arquitetura

O carregador atual importa automaticamente os arquivos JavaScript de `src/commands/member`; portanto, o novo comando não precisa de registro manual em `src/app.js` ou no roteador. A conversão fica isolada em `src/services/gif.js`, usando `execFile` com argumentos separados para evitar interpolação de shell.

## Restrições

- Reutilizar o FFmpeg já exigido pelos recursos de mídia do bot.
- Não adicionar dependências npm nem usar a Melissa API, que não possui uma rota de conversão GIF documentada no cliente atual.
- Não alterar os serviços existentes de sticker, downloader ou o fluxo geral de comandos.
- Manter compatibilidade com Node.js ESM e Android/Termux.
