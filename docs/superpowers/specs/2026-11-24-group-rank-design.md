# Ranking automático por grupo

## Intenção
Adicionar ao Chiru-san Bot um ranking de participação independente por grupo. O bot começa a contabilizar mensagens novas automaticamente, e `.rank` mostra os dez participantes mais ativos. Um argumento numérico permite exibir até trinta posições.

## Objetivos
- Manter estatísticas isoladas pelo JID de cada grupo.
- Contabilizar mensagens recebidas de participantes, incluindo texto, mídias, reações, enquetes e outros tipos reconhecidos pelo Baileys.
- Guardar por participante: identificador, nome exibido mais recente, total de mensagens, total de comandos, contagem por tipo e datas da primeira e da última mensagem.
- Guardar por grupo: total de mensagens, participantes contabilizados, contagem por tipo e datas da primeira e da última mensagem.
- Persistir os agregados em `data/group-rankings.json`, com escrita atômica e agrupada.
- Manter o conteúdo das mensagens fora do arquivo.

## Fora do escopo
- Importar ou recontar o histórico antigo do WhatsApp.
- Armazenar texto, legendas, anexos, números de telefone derivados ou conteúdo de conversas.
- Criar rankings globais entre grupos, pontuação por qualidade ou períodos semanais/mensais.

## Comportamento
- Apenas mensagens novas do evento Baileys `messages.upsert` do tipo `notify` entram no ranking.
- Mensagens do próprio bot, conversas privadas e mensagens sem identificador de participante são ignoradas.
- `.rank` mostra 10 posições por padrão; `.rank 30` mostra até 30. O limite máximo é 30.
- Cada grupo possui seus próprios totais e participantes.
- O ranking é acumulado a partir da instalação desta versão, sem preenchimento retroativo.

## Arquitetura
Um serviço dedicado mantém o estado carregado em memória, atualiza contadores e agenda a gravação JSON atômica. O evento `messages.upsert` chama esse serviço diretamente, antes de enviar a mensagem à fila de comandos, para que mensagens comuns sejam contadas sem aumentar a carga da fila principal. Um comando de membro consulta o serviço e formata o ranking com menções do WhatsApp.

## Restrições
- Preservar Node.js ESM e as dependências atuais; não adicionar dependências.
- Manter o ranking disponível por padrão em todos os grupos, independente do comando ter sido usado anteriormente.
- Manter o arquivo de estatísticas como dado local de execução, fora do Git.
- Preservar o processamento atual de comandos e mídias.
