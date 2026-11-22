# Per-Group Command Limiter Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with test-driven development. Steps use checkbox syntax for tracking.

**Goal:** Add a local Termux CLI that persists per-group command switches and make the bot enforce them.

**Architecture:** A small service owns `data/command-limits.json`, caches the settings once per process, and serializes atomic writes. The CLI reuses the bot's real command registry, while `CommandHandler` checks the canonical command name and separately covers the special media commands.

**Tech Stack:** Node.js ESM, `node:fs/promises`, `node:test`, existing Baileys message shape.

**Spec:** `docs/superpowers/specs/2026-11-22-per-group-command-limiter-design.md`

## Global Constraints
- No new runtime dependencies.
- Group identifiers come from `msg.key.remoteJid` and are group JIDs ending in `@g.us`.
- Missing per-group command settings mean ON.
- Each CLI change is persisted immediately.
- `.identificador` is an always-available command and cannot be disabled through this limiter.
- Changes made by the separate CLI are read by the bot after restart.

## Review Focus
- Private chats must retain existing behavior and must not be limited by group settings.
- A missing settings file means all commands are enabled.
- Corrupt JSON must not be silently replaced with an empty configuration.
- Special `.mp3` and `.mp4` handlers must obey the same per-group setting.
- Aliases such as `.pack2` must be checked against the primary command name `pack`.
- `.identificador` must still work when the global group state is OFF.

---

### Task 1: Per-group settings service

**Files:**
- Create: `src/services/commandLimiter.js`
- Test: `tests/commandLimiter.test.js`
- Modify: `package.json`
- Create: `.github/workflows/command-limiter.yml`

**Interfaces:**
- `isCommandEnabled(groupJid, commandName): Promise<boolean>`
- `setCommandEnabled(groupJid, commandName, enabled): Promise<void>`
- `getGroupCommandLimits(groupJid): Promise<object>`

- [ ] Write tests proving default-ON behavior, per-group isolation, persistence, concurrent updates, and rejection of invalid group identifiers.
- [ ] Run `npm run test:limiter`; expected RED because the service module does not exist yet.
- [ ] Implement the service with a process-local cache and atomic JSON writes.
- [ ] Run `npm run test:limiter`; expected PASS.
- [ ] Commit the task.

### Task 2: Bot integration, identifier command, and Termux CLI

**Files:**
- Create: `src/commands/member/identificador.js`
- Create: `limitador.js`
- Create: `tests/commandLimiterHandler.test.js`
- Modify: `src/handlers/CommandHandler.js`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `.github/workflows/command-limiter.yml`

**Interfaces:**
- `limitador.js` uses `CommandHandler.loadCommands()` to obtain canonical registered names, and adds the special media commands `mp3` and `mp4`.
- Registered command checks use `command.name` so aliases inherit the primary command's setting.
- The media branch checks the parsed media command name directly.

- [ ] Add handler tests first for disabled registered commands, aliases, media commands, and the always-available identifier command.
- [ ] Run the focused tests and observe the expected RED results before changing production integration.
- [ ] Add `.identificador` and the local interactive CLI.
- [ ] Add enforcement to both the registered-command path and special media path without changing existing owner/admin checks.
- [ ] Run `npm run test:limiter` and `npm run check:syntax`; expected PASS.
- [ ] Commit the task and inspect the resulting branch diff.
