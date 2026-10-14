---
description: Check whether the local Cursor CLI is ready for the Claude Code bridge
argument-hint: ''
allowed-tools: Bash(node:*), AskUserQuestion
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cursor-bridge.mjs" check --plugin-data "${CLAUDE_PLUGIN_DATA}"
```

The bridge prints the result as a fixed table. Present it to the user as that table:
- Keep the title, every row, and the row order exactly as printed. Do not add rows, drop rows, merge them, or turn the table into a list.
- Write the title, the labels and the descriptive text in the language the user writes in. Keep versions, account names, paths and commands exactly as printed.
- Keep every next step.
- Add nothing else: no extra summary before or after the table.

If the table says cursor-agent is not found:
- Do not invent an install path. The next steps already say how to install the Cursor CLI and put `cursor-agent` on PATH (or set `CURSOR_AGENT_BINARY`); rerun `/cursor-cc:check` after installing.

If Cursor is installed but not signed in:
- Keep the sign-in steps from the table (complete login via `cursor-agent login`, then verify with `cursor-agent status`).

If the Bash tool cannot start the command at all, run it once from PowerShell instead (`& node "${CLAUDE_PLUGIN_ROOT}/scripts/cursor-bridge.mjs" check --plugin-data "${CLAUDE_PLUGIN_DATA}"`) and present its table the same way.
