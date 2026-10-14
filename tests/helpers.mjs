import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

// Every test file runs in its own process; what it created in the temp
// directory goes when that process exits, so test runs do not pile up there.
const createdTempDirs = [];
process.on("exit", () => {
  for (const dir of createdTempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2 });
    } catch {
      // still in use (a background worker on Windows): left for the OS
    }
  }
});

export function makeTempDir(prefix = "cursor-cc-plugin-test-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdTempDirs.push(dir);
  return dir;
}

// Run inside a Claude Code session, the shell hands the tests some plugin's
// CLAUDE_PLUGIN_DATA (often this plugin's real one). Tests never write there:
// every test file starts with a plugin data directory of its own.
delete process.env.CURSOR_CC_PLUGIN_DATA;
process.env.CLAUDE_PLUGIN_DATA = makeTempDir("cursor-cc-plugin-data-");

export function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, { encoding: "utf8", mode: 0o755 });
}

export function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    input: options.input,
    shell: options.shell ?? (process.platform === "win32" && !path.isAbsolute(command)),
    windowsHide: true
  });
}

export function initGitRepo(cwd) {
  run("git", ["init", "-b", "main"], { cwd });
  run("git", ["config", "user.name", "Cursor Plugin Tests"], { cwd });
  run("git", ["config", "user.email", "tests@example.com"], { cwd });
  run("git", ["config", "commit.gpgsign", "false"], { cwd });
  run("git", ["config", "tag.gpgsign", "false"], { cwd });
}
