# Security

This plugin runs on your machine, spawns the Cursor CLI as a child process, and
writes run state under your plugin data directory. It has no server component,
no telemetry, and no credentials of its own — it uses whatever account your
`cursor-agent` is already signed in as.

## Threat model

The realistic attackers are:

1. **Repository content.** File names, diffs, branch names and commit messages
   from a repository you review end up in argv (git commands) and in the prompt
   sent to the agent. A hostile repository is a normal thing to review.
2. **Your own arguments.** Slash-command arguments (`--model`, a run id, a path)
   flow into a child process command line.
3. **On-disk run state.** Job records under the plugin data directory hold pids
   and file paths that the plugin later acts on.

The plugin is *not* designed to defend you against an agent you deliberately
gave write access to. `/cursor-cc:delegate --write` can edit your files. That is
the point of it.

## What is enforced

| Boundary | How |
|---|---|
| No shell is used to find or run a binary | `runCommand` and `spawnCli` pass `shell: false`; libuv searches `PATH`/`PATHEXT` itself, so repository-derived argv (git refs in particular) is never re-parsed by a shell |
| Windows `.cmd` / `.bat` shims cannot be used to inject commands | Every token is quoted for the child's CRT parser and then caret-escaped for `cmd`, **twice** for a batch target, because a batch file re-parses its own `%*`. This is the CVE-2024-24576 class of bug; see `quoteWindowsArg` in `scripts/lib/process.mjs` and the round-trip tests in `tests/windows-escaping.test.mjs` |
| Free-form text never reaches a command line | The prompt is written to the child's **stdin**, not argv, so `cmd` cannot expand `%VAR%` inside it |
| Flag values cannot become flags | `--model`, `--mode`, `--output-format`, the resume session id and the workspace path are pattern-checked before being pushed into argv. `--model --force` is refused rather than silently turning a read-only review into a write run (`assertSafeCliValue` in `scripts/lib/cursor.mjs`) |
| Run ids cannot escape the run directory | Run ids arrive from slash-command arguments and become a path component; `assertSafeJobId` in `scripts/lib/state.mjs` rejects anything outside `[A-Za-z0-9._-]` or containing `..` |
| Review and critique cannot edit files | They run with Cursor's `--mode ask`, which refuses file creation and edits. This is checked in `tests/cursor-bridge-permissions.test.mjs` |
| Delegation is read-only unless you say otherwise | The delegate subagent is instructed to run read-only and to add `--write` only when *your own words* asked for edits. Repository content never authorises `--write` |
| A read-only mode and write access cannot both be requested | `--write --mode ask` is an error rather than a silent win for one of them |
| Repository symlinks cannot exfiltrate files | Untracked file bodies are inlined into the prompt. `formatUntrackedFile` uses `lstat`, skips symlinks and non-regular files, refuses anything whose real path is outside the repository, and holds back names that usually carry credentials (`.env`, `id_rsa`, `*.pem`, …) |
| Pruning cannot delete arbitrary files | A job record's `logFile` path comes from json on disk. It is only unlinked when it really resolves inside that workspace's run directory |
| Stopping a run cannot kill an unrelated process | Pids are read from json and the operating system reuses them, so a process is only signalled when its command line still looks like `cursor-agent` or `cursor-bridge.mjs`. A mismatch is reported as skipped and the run is still marked cancelled |
| Run state is not readable by other local users | The run directory is created `0o700` and files are written `0o600` (POSIX; on Windows the default ACL applies) |
| A crashed run cannot wedge the plugin | The state lock records its holder's pid; a lock whose owner is gone is broken once by the next waiter |
| Slash-command text does not reach a shell unquoted | The `runs` / `show` / `stop` commands no longer pre-execute a `!` shell line with `$ARGUMENTS` interpolated into it, and `review` / `critique` single-quote the forwarded argument string |
| A child cannot exhaust memory | Agent stdout/stderr is capped at 32 MiB and piped stdin at 8 MiB |

## Known limitations

These are real and deliberate. They are listed so nobody has to discover them by
reading the source.

- **`%VAR%` in a workspace path on Windows.** A path containing `%NAME%` where
  `NAME` is a defined environment variable can be rewritten by `cmd` when the
  Cursor CLI is a `.cmd` shim. Values are escaped, so this is a correctness
  wart, not an injection.
- **Prompt injection is not solved.** Repository content is included in the
  prompt. A hostile repository can try to steer the agent. The mitigation here
  is the read-only mode on review and critique, not prompt filtering.
- **The read-only boundary is the Cursor CLI's.** The bridge passes `--mode ask`
  and trusts the CLI to honour it. That was verified by hand against Cursor
  `2026.08.25` (it refused to create a file), but the plugin cannot prove it on
  every version; the tests assert the argv, not the CLI's behaviour.
- **The check report shows the signed-in account.** `/cursor-cc:check` prints
  what `cursor-agent status` prints, which includes your account. Redact it
  before pasting the output into a public issue.
- **Job records hold the prompt.** A background run stores its request, prompt
  included, under your plugin data directory. Treat that directory as
  containing whatever you sent to the agent.

## Reporting

Open an issue at https://github.com/rionmint/cursor-plugin-cc/issues. If the
report includes a working exploit, say so in the title so it can be handled
before the details spread.
