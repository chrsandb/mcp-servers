# AGENTS.md

This repository contains a repo-local planning workspace for the pending write-support work on the Check Point MCP servers.

Scope of this planning workspace:
- `packages/management`
- `packages/threat-prevention`
- `packages/https-inspection`

Primary planning directory:
- [`planning/write-support/README.md`](/home/csandberg/projects/cp-mcp-writeable/planning/write-support/README.md)

Rules for Codex and other agents working in this repo:
- Read the planning workspace before starting implementation for the write-support effort.
- Keep the planning files current as work evolves. Do not leave research, scope, or progress only in chat history.
- Keep implementation and planning changes tracked by Git as work evolves:
  - stage newly created files and modified files before handing work back
  - do not commit unless the user explicitly asks for a commit
  - inspect new local/runtime files before staging if they could contain credentials, tokens, logs, or machine-specific state
- Preserve the repo's current design:
  - Reuse `packages/infra` and `packages/mcp-utils` where possible.
  - Follow the existing MCP server registration style.
  - Avoid unrelated refactors.
- Treat write operations as safety-sensitive:
  - Prefer non-destructive scope first.
  - Do not auto-publish or auto-install policy unless the user explicitly asks for that behavior.
  - Record any scope changes or new risks in the planning workspace before implementing them.
- If implementation begins later, update these files during the work:
  - `planning/write-support/progress.md`
  - `planning/write-support/task-checklist.md`
  - `planning/write-support/decision-log.md`
- If assumptions change, update:
  - `planning/write-support/research-summary.md`
  - `planning/write-support/recommended-scope.md`
  - `planning/write-support/guardrails.md`
- If new tests are added or the validation approach changes, update:
  - `planning/write-support/test-strategy.md`

Suggested workflow:
1. Read the planning workspace.
2. Confirm or revise scope in `recommended-scope.md`.
3. Update `task-checklist.md` with the next concrete implementation slices.
4. Implement in small increments.
5. Record progress and decisions as you go.

This file is intentionally lightweight. The detailed working context lives under `planning/write-support/`.
