# Changelog

## 0.2.0

Security release. Everything below was found by an adversarial review of 0.1.0
by Grok Build and Codex, plus follow-up work here. Several of the findings were
reproduced with working payloads before being fixed, and each one now has a
regression test.

If you installed 0.1.0, update.

### Fixed — command execution

- **Command injection through a Windows `.cmd` shim (critical).** The Cursor CLI
  ships as `cursor-agent.cmd` on Windows, so the bridge goes through `cmd.exe`.
  Wrapping an argument in double quotes is not enough: a `"` inside the value
  closes cmd's quoted region and the rest is parsed as cmd syntax again. Worse,
  a batch file re-expands `%*` into its own line, so a single round of escaping
  is consumed by the outer parse (the CVE-2024-24576 class). Reproduced with
  `--model 'x" & echo pwned>PWNED.txt & rem "'`, which created the file. Every
  token is now quoted for the child's parser and caret-escaped for cmd, twice
  for a batch target.
- **The prompt no longer travels on the command line.** It is written to the
  child's stdin, which Cursor accepts, so free-form text cannot be touched by
  cmd's `%VAR%` expansion at all.
- **Argument injection.** `--model`, `--mode`, `--output-format`, the resume
  session id and the workspace path are pattern-checked before they are pushed
  into argv. Previously `--model --force` would have been read by Cursor as a
  flag and turned a read-only review into a write-capable run.
- **`!` shell interpolation removed from the `runs`, `show` and `stop`
  commands.** They pre-executed a shell line with `$ARGUMENTS` substituted into
  it, so a run id of `$(...)` was a command. `review` and `critique` now
  single-quote the forwarded argument string.

### Fixed — file system

- **Path traversal through a run id.** Run ids arrive from slash-command
  arguments and become a path component; `/cursor-cc:show ../../outside` read
  and wrote outside the run directory. Ids are now validated.
- **Untracked symlinks are no longer followed into the prompt.** A repository
  could ship `notes.md -> ~/.ssh/id_rsa` and have the key inlined into the
  review prompt. `lstat` is used, symlinks and non-regular files are skipped,
  anything resolving outside the repository is refused, and names that usually
  hold credentials (`.env`, `id_rsa`, `*.pem`, …) are held back.
- **Arbitrary file deletion during pruning.** A job record's `logFile` path is
  json on disk; pruning unlinked it without question. It is now only removed
  when it really resolves inside that workspace's run directory.
- **Run state permissions.** The run directory is created `0o700` and files are
  written `0o600`, which matters because the fallback root is under the system
  temp directory.

### Fixed — process and state handling

- **Stopping a run verifies what it is about to kill.** Pids come from json and
  the operating system reuses them, so a stale record could name the user's
  editor or shell. A process is only signalled when its command line still looks
  like `cursor-agent` or `cursor-bridge.mjs`; a mismatch is reported and skipped.
- **A crashed run no longer wedges the plugin.** The state lock records its
  holder's pid and a lock whose owner is gone is broken once by the next waiter.
  Before this, a lock left behind by a crash made every later save — including
  `stop` — fail until someone deleted the file by hand.
- **Bounded buffers.** Agent stdout/stderr is capped at 32 MiB and piped stdin
  at 8 MiB. A stuck child could previously grow a string until the bridge died.
- **The session hook refuses to export a value containing a line break**, which
  would otherwise append a second `export` line to a file the host sources.

### Changed — the write boundary

- **Delegation is read-only by default.** 0.1.0 inherited an instruction to add
  `--write` unless the user asked otherwise, while the README claimed the
  opposite. The subagent now adds `--write` only when the user's own words asked
  for edits, and repository content never authorises it.
- **`--write` together with `--mode ask` is an error.** It used to silently drop
  the read-only mode.
- **The delegate subagent is no longer advertised for proactive use.**

### Added

- [SECURITY.md](./SECURITY.md) — threat model, what is enforced, and what is
  deliberately not defended.
- Regression tests: Windows escaping round-trips over hostile arguments, the
  injection payload, run-id traversal, flag-lookalike values, symlink and
  credential-name handling in untracked files, and kill identity checks.

## 0.1.0

First release. A Claude Code bridge to the Cursor CLI, derived from
[xai-org/grok-build-plugin-cc](https://github.com/xai-org/grok-build-plugin-cc)
under Apache-2.0. See [NOTICE](./NOTICE) for the full attribution and the list
of changes made to the upstream project.
