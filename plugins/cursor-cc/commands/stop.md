---
description: Stop an active background Cursor run in this repository
argument-hint: '[run-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/cursor-bridge.mjs" stop "$ARGUMENTS"`
