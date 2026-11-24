# Ranking automático por grupo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contabilizar mensagens novas separadamente por grupo e expor `.rank` com top 10 padrão e limite de 30.

**Architecture:** Um serviço com estado em memória e persistência JSON atômica agrupada registra agregados sem salvar conteúdo. O listener `messages.upsert` conta mensagens `notify` diretamente, sem colocar mensagens comuns na fila de comandos; um comando dedicado consulta os dados.

**Tech Stack:** Node.js ESM, Baileys v7, `node:fs/promises`, testes nativos `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-24-group-rank-design.md`

## Global Constraints
- Não adicionar dependências.
- Não salvar textos, legendas, anexos ou conteúdo privado das mensagens.
- Não reprocessar o histórico antigo.
- Não contar mensagens do próprio bot nem conversas privadas.
- Não alterar o fluxo de processamento atual de comandos e mídias.

## Review Focus
- Mensagem sem `participant`: ignorar, sem criar um usuário fantasma.
- Evento com mensagem privada: ignorar.
- Mensagem própria do bot: ignorar.
- Mensagem encapsulada em ephemeral/view-once: reconhecer seu tipo.
- Argumento `.rank` inválido ou acima de 30: manter o limite seguro e não falhar.

---

### Task 1: Serviço de estatísticas e testes

**Files:**
- Create: `src/services/groupRanking.js`
- Test: `tests/groupRanking.test.js`

**Interfaces:**
- `recordGroupMessage(msg)`: valida e agrega uma mensagem recebida; retorna `true` se contabilizada e `false` se ignorada.
- `getGroupRanking(groupJid, limit = 10)`: retorna total do grupo, total de participantes e os participantes ordenados por mensagens, limitados a no máximo 30.
- `flushGroupRankings()`: conclui a gravação pendente no JSON.

- [ ] Escrever os testes de contagem por grupo/participante, tipos de mensagem, comandos, exclusões e persistência.
- [ ] Executar `node --test tests/groupRanking.test.js` e observar falha por ausência do serviço.
- [ ] Implementar serviço com atualização em memória, escrita agrupada/atômica em `GROUP_RANKINGS_FILE` ou `data/group-rankings.json`.
- [ ] Executar o teste novamente e confirmar PASS.

### Task 2: Comando e coleta automática

**Files:**
- Create: `src/commands/member/rank.js`
- Modify: `src/app.js`
- Test: `tests/groupRankCommand.test.js`

**Interfaces:**
- O comando usa `getGroupRanking` e `flushGroupRankings`.
- O listener `messages.upsert` chama `recordGroupMessage` apenas quando o tipo de evento é `notify`.

- [ ] Escrever testes do comando para top 10 padrão, limite 30 e uso fora de grupos.
- [ ] Executar `node --test tests/groupRankCommand.test.js` e observar falha antes de criar o comando.
- [ ] Implementar `.rank` com alias `.ranking`, menções e resumo das estatísticas.
- [ ] Conectar o registro ao evento sem ampliar `isRelevantMessage` nem a fila principal.
- [ ] Executar os testes dos dois arquivos.

### Task 3: Integração de qualidade e documentação

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `.github/workflows/integrity.yml`
- Modify: `README.md`

- [ ] Ignorar o JSON de execução e arquivos temporários.
- [ ] Adicionar `npm run test:rank` e executá-lo no workflow de integridade.
- [ ] Documentar `.rank`, `.rank 30` e o início da contagem sem histórico retroativo.
- [ ] Executar `npm run check:syntax`, `npm run test:rank` e os testes existentes configurados no workflow.
- [ ] Conferir o diff completo e os caminhos alterados.
