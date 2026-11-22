# Per-Group Command Limiter

## Intent
Allow the owner to turn individual bot commands on or off for one WhatsApp group at a time, using a local Termux prompt rather than a WhatsApp admin command.

## Behavior
- `.identificador` replies with the current group's `msg.key.remoteJid` JID, normally ending in `@g.us`.
- `node limitador.js` asks for that JID, displays the bot's canonical registered commands as enabled by default, and accepts `<command> on` or `<command> off`.
- The CLI writes each change immediately to `data/command-limits.json`, keyed by group JID.
- Unconfigured commands remain enabled. Each group has independent settings.
- The bot loads the file in its own process and applies the setting before running a command. Restarting the bot after CLI changes refreshes its in-memory configuration.
- `.identificador` remains available even when the whole bot or that individual command is disabled, so the group JID can always be retrieved.
- Commands implemented outside the command registry, currently `.mp3` and `.mp4`, are also listed and limited.

## Approaches
1. Read the JSON file on every command: simple but adds repeated disk I/O to message handling.
2. Cache the settings once per process and atomically save changes from the CLI: keeps message handling cheap and matches the requested restart workflow. **Chosen.**
3. Add a WhatsApp command for configuration: rejected because the requested control surface is a separate local Termux process and should not depend on group permissions.

## Constraints and non-goals
- Use the existing Node.js ESM codebase and built-in modules only; add no dependency.
- Use the group JID from `msg.key.remoteJid`, not a participant/user LID.
- Preserve the existing global group on/off behavior and owner/admin authorization.
- Do not add a WhatsApp command to change limiter settings.
- Do not hot-reload the bot's cached settings; a bot restart is the explicit refresh step.
