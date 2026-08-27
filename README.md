# cursor-plugin-cc

A Claude Code marketplace plugin that hands work to the **Cursor CLI** (`cursor-agent`) and brings the
result back into the Claude Code session — review, critique, and delegation, with background runs you
can list, inspect, and stop.

It shells out to the real `cursor-agent` binary. Run status, results, and cancellation are owned by the
plugin itself (PID + log files on disk). There is no broker process and no API key of its own: whatever
your Cursor CLI is signed in as is what runs.

> Unofficial and community-maintained. Not affiliated with Anysphere (Cursor), xAI, OpenAI, or Anthropic.
> Derived from [xai-org/grok-build-plugin-cc](https://github.com/xai-org/grok-build-plugin-cc) under
> Apache-2.0 — see [NOTICE](./NOTICE) for the full attribution and the list of changes.

---

## Requirements

- Node.js 18.18+
- The Cursor CLI on `PATH` as `cursor-agent` (or set `CURSOR_AGENT_BINARY`)
- A signed-in Cursor CLI (`cursor-agent login`) **or** `CURSOR_API_KEY` in the environment

Installing the Cursor desktop app does **not** install the CLI, and signing in to the desktop app does
**not** sign in the CLI — they keep separate credentials. Install and authenticate the CLI separately:

```bash
# macOS / Linux / WSL
curl https://cursor.com/install -fsS | bash
```

```powershell
# Windows
irm 'https://cursor.com/install?win32=true' | iex
```

```bash
cursor-agent login      # opens a browser
cursor-agent status     # prints the signed-in account
```

---

## Install the plugin

```
/plugin marketplace add rionmint/cursor-plugin-cc
/plugin install cursor-cc@rionmint-cursor-cc
```

Then confirm the local setup:

```
/cursor-cc:check
```

Ready means: Node is available, `cursor-agent` is available, and the auth probe succeeds.

---

## Commands

| Command | What it does |
|---|---|
| `/cursor-cc:check` | Reports whether Node, the Cursor CLI, and authentication are ready, with next steps when they are not |
| `/cursor-cc:review` | Runs a code review against local git state and returns Cursor's output verbatim |
| `/cursor-cc:critique` | Challenges the implementation approach and design choices; returns structured findings |
| `/cursor-cc:delegate` | Hands an investigation or coding task to the `cursor-delegate` subagent |
| `/cursor-cc:runs` | Lists active and recent runs for this repository |
| `/cursor-cc:show` | Prints the stored final output of a finished run |
| `/cursor-cc:stop` | Stops an active background run |

Common flags:

| Flag | Meaning |
|---|---|
| `--background` / `--wait` | Detach the run, or block until it finishes |
| `--base <ref>` / `--scope auto\|working-tree\|branch` | What the review compares against |
| `--model <model>` | Cursor model id (`cursor-agent --list-models` to see them) |
| `--mode ask\|plan` | Read-only execution mode (default `ask`) |
| `--write` | Delegation only — allow edits (drops the read-only mode) |
| `--resume-last` / `--fresh` | Continue the last delegate session in this repo, or start a new one |

---

## Safety model

The read-only boundary is Cursor's own execution mode, not a sandbox:

- `--mode ask` — question-and-answer only. **Verified to refuse file creation and edits.**
- `--mode plan` — analysis and planning, no edits.
- No mode + `--write` — the agent may edit files and run tools. Reserved for `/cursor-cc:delegate --write`.

Review and critique always run read-only. Delegation is read-only unless you pass `--write`.

Headless runs also pass `--trust`. Without it, a non-interactive Cursor run stops on the workspace-trust
prompt with nobody to answer it.

---

## How a run works

```
cursor-agent -p <prompt> --workspace <ws> --mode ask --output-format text --trust
```

- Review uses `--output-format text`; critique uses `--output-format json` and unwraps the result
  envelope before parsing the structured findings.
- `--output-format` is only honoured together with `-p` / `--print`.
- The session id is read back out of Cursor's result envelope (`session_id`); it cannot be assigned up
  front. `--resume-last` continues the stored session via `cursor-agent --resume <id>`.
- Background runs record both `bridgePid` (the Node worker) and `agentPid` (the detached `cursor-agent`
  child). `/cursor-cc:stop` kills every distinct pid among them. Terminal status is claimed under a
  locked compare-and-set, so a finishing worker cannot overwrite `cancelled` with `completed`.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `CURSOR_AGENT_BINARY` | Override the `cursor-agent` executable path |
| `CURSOR_API_KEY` / `CURSOR_AUTH_TOKEN` | Non-interactive authentication |
| `CURSOR_CC_SESSION_ID` | Claude session id (set by the SessionStart hook) |
| `CLAUDE_PLUGIN_DATA` | Where run state and logs are written |

---

## Differences from the Grok Build plugin this is derived from

| | Grok Build plugin | This plugin |
|---|---|---|
| Working directory flag | `--cwd` | `--workspace` |
| Read-only | `--sandbox read-only` (**not enforced on Windows**) | `--mode ask` / `--mode plan` (enforced) |
| Workspace trust | n/a | `--trust` required for headless |
| Reasoning effort | `--effort low\|medium\|high` | carried by the model id (`…-high`, `…-xhigh`) |
| Structured output | `--json-schema` flag | schema in the prompt + envelope unwrapping |
| Session id | assigned before the run | read back from the result envelope |
| Claude session import | `grok import` | removed (no Cursor equivalent) |
| Auth probe | `grok models` | `cursor-agent status` |

---

## Development

```bash
npm test          # node --test tests/*.test.mjs
npm run bump-version
```

Tests use Node's built-in test runner and a fake `cursor-agent` binary placed on `PATH`. Runtime code
uses the Node standard library only — there are no dependencies.

---

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
