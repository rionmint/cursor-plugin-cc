import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { splitRawArgumentString } from "../plugins/cursor-cc/scripts/lib/args.mjs";
import { buildEnv, installFakeCursor } from "./fake-cursor-fixture.mjs";
import { initGitRepo, makeTempDir, run } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "plugins", "cursor-cc", "scripts", "cursor-bridge.mjs");

test("a backslash only escapes a quote, so paths survive tokenizing", () => {
  // The tokenizer used to treat every backslash as an escape, which turned
  // `C:\src\app.ts` into `C:srcapp.ts`.
  assert.deepEqual(splitRawArgumentString(String.raw`inspect C:\src\app.ts`), [
    "inspect",
    String.raw`C:\src\app.ts`
  ]);
  assert.deepEqual(splitRawArgumentString(String.raw`focus on /foo\d+/`), [
    "focus",
    "on",
    String.raw`/foo\d+/`
  ]);
});

test("quotes still group words and are still escapable", () => {
  assert.deepEqual(splitRawArgumentString('keep "quoted words"'), ["keep", "quoted words"]);
  assert.deepEqual(splitRawArgumentString(String.raw`say \"hi\"`), ["say", '"hi"']);
});

function setupReviewableRepo() {
  const repo = makeTempDir();
  const binDir = makeTempDir();
  const pluginDataDir = makeTempDir();
  const fakeCursorLog = path.join(pluginDataDir, "fake-cursor.log");
  installFakeCursor(binDir);
  initGitRepo(repo);
  fs.writeFileSync(path.join(repo, "src.js"), "export const value = 1;\n");
  run("git", ["add", "src.js"], { cwd: repo });
  run("git", ["commit", "-m", "init"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "src.js"), "export const value = 2;\n");
  return { repo, binDir, pluginDataDir, fakeCursorLog };
}

function lastFakeCursorArgv(logPath) {
  const entries = fs
    .readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const printRun = [...entries].reverse().find((entry) => entry.argv?.includes("--print"));
  assert.ok(printRun, "expected a headless cursor-agent invocation");
  return printRun.argv;
}

test("flags packed into one argument alongside another are not dropped", () => {
  // Slash commands forward the user's arguments as a single string. When a
  // command also adds its own flag, that string is no longer the sole argv
  // entry — and it used to be swallowed as one unknown option, silently losing
  // --base, --scope, --model, --mode and any focus text.
  const { repo, binDir, pluginDataDir, fakeCursorLog } = setupReviewableRepo();

  const result = run("node", [SCRIPT, "review", "--model auto --mode plan"], {
    cwd: repo,
    env: buildEnv(binDir, { CLAUDE_PLUGIN_DATA: pluginDataDir, FAKE_CURSOR_LOG: fakeCursorLog })
  });

  assert.equal(result.status, 0, result.stderr);
  const argv = lastFakeCursorArgv(fakeCursorLog);
  assert.equal(argv[argv.indexOf("--model") + 1], "auto");
  assert.equal(argv[argv.indexOf("--mode") + 1], "plan");
  assert.doesNotMatch(result.stderr, /ignoring unknown option/);
});

test("--plugin-data after other options is used, not sent to Cursor as prompt text", () => {
  // A call written by hand put it after --fresh. As an unknown option it was
  // dropped with a warning, its directory went to Cursor at the front of the
  // prompt, and the run was stored in the temp fallback.
  const { repo, binDir, pluginDataDir, fakeCursorLog } = setupReviewableRepo();
  const otherPlugin = makeTempDir();
  const promptLog = path.join(makeTempDir(), "prompt.txt");

  const result = run("node", [SCRIPT, "run", "--fresh", "--plugin-data", pluginDataDir, "read the code"], {
    cwd: repo,
    env: buildEnv(binDir, {
      CLAUDE_PLUGIN_DATA: otherPlugin,
      CURSOR_CC_PLUGIN_DATA: "",
      FAKE_CURSOR_LOG: fakeCursorLog,
      FAKE_CURSOR_PROMPT_LOG: promptLog
    })
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /ignoring unknown option/);
  assert.equal(fs.readFileSync(promptLog, "utf8").trim(), "read the code");
  assert.ok(fs.existsSync(path.join(pluginDataDir, "state")), "state is in the given directory");
  assert.ok(!fs.existsSync(path.join(otherPlugin, "state")), "not in the other plugin's");
});

test("--plugin-data right after the subcommand wins over a later one", () => {
  const { repo, binDir, pluginDataDir, fakeCursorLog } = setupReviewableRepo();
  const later = makeTempDir();
  const promptLog = path.join(makeTempDir(), "prompt.txt");

  const result = run("node", [SCRIPT, "run", "--plugin-data", pluginDataDir, "--fresh --plugin-data " + later + " read the code"], {
    cwd: repo,
    env: buildEnv(binDir, { CURSOR_CC_PLUGIN_DATA: "", FAKE_CURSOR_LOG: fakeCursorLog, FAKE_CURSOR_PROMPT_LOG: promptLog })
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /ignoring --plugin-data/);
  assert.equal(fs.readFileSync(promptLog, "utf8").trim(), "read the code");
  assert.ok(fs.existsSync(path.join(pluginDataDir, "state")));
  assert.ok(!fs.existsSync(path.join(later, "state")));
});
