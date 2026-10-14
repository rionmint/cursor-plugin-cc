import test from "node:test";
import assert from "node:assert/strict";

import { renderReviewResult, renderSetupReport, renderStoredJobResult } from "../plugins/cursor-cc/scripts/lib/render.mjs";

function checkReport(overrides = {}) {
  return {
    ready: true,
    node: { available: true, detail: "v24.13.1" },
    cursor: { available: true, detail: "2026.10.14-0f9edde", binary: "cursor-agent" },
    auth: { loggedIn: true, detail: "Logged in as someone@example.com" },
    actionsTaken: [],
    nextSteps: [],
    ...overrides
  };
}

test("the check is one fixed table with the same rows in the same order", () => {
  const output = renderSetupReport(checkReport());
  const labels = [...output.matchAll(/^\| ([^|]+) \|/gm)].map((match) => match[1].trim());
  assert.deepEqual(labels, ["Item", "Node", "cursor-agent", "Sign-in", "Runs"]);
  assert.match(output, /^## Cursor check: ready$/m);
  assert.match(output, /Next steps: none\./);
});

test("a check that is not ready keeps its next steps and says what is missing", () => {
  const output = renderSetupReport(
    checkReport({
      ready: false,
      auth: { loggedIn: false, detail: "not logged in" },
      nextSteps: ["Authenticate the Cursor CLI with `cursor-agent login` (opens a browser)."]
    })
  );
  assert.match(output, /^## Cursor check: needs attention$/m);
  assert.match(output, /\| Sign-in \| not signed in \(not logged in\) \|/);
  assert.match(output, /- Authenticate the Cursor CLI/);
});

test("renderReviewResult degrades gracefully when JSON is missing required review fields", () => {
  const output = renderReviewResult(
    {
      parsed: {
        verdict: "approve",
        summary: "Looks fine."
      },
      rawOutput: JSON.stringify({
        verdict: "approve",
        summary: "Looks fine."
      }),
      parseError: null
    },
    {
      reviewLabel: "Critique",
      targetLabel: "working tree diff"
    }
  );

  assert.match(output, /Cursor returned JSON with an unexpected review shape\./);
  assert.match(output, /Missing array `findings`\./);
  assert.match(output, /Raw final message:/);
});

test("renderStoredJobResult prefers rendered output for structured review jobs", () => {
  const output = renderStoredJobResult(
    {
      id: "review-123",
      status: "completed",
      title: "Cursor Critique",
      jobClass: "review",
      threadId: "thr_123"
    },
    {
      threadId: "thr_123",
      rendered: "# Cursor Critique\n\nTarget: working tree diff\nVerdict: needs-attention\n",
      result: {
        result: {
          verdict: "needs-attention",
          summary: "One issue.",
          findings: [],
          next_steps: []
        },
        rawOutput:
          '{"verdict":"needs-attention","summary":"One issue.","findings":[],"next_steps":[]}'
      }
    }
  );

  assert.match(output, /^# Cursor Critique/);
  assert.doesNotMatch(output, /^\{/);
  assert.match(output, /Cursor session ID: thr_123/);
  assert.match(output, /Resume in Cursor: cursor-agent --resume thr_123/);
});

test("table cells survive missing fields, pipes and every kind of line break", () => {
  const output = renderSetupReport({ ready: false, node: null, auth: { loggedIn: false, detail: "a|b\rc\r\nd\ne" } });
  assert.doesNotMatch(output, /undefined/);
  assert.match(output, /not signed in \(a\\\|b c d e\)/);
  assert.match(output, /\| Node \| not found \(unknown\) \|/);
});
