# Working Prompt For Future Implementation

Task:
- Add safe, incremental write support to:
  - `packages/management`
  - `packages/threat-prevention`
  - `packages/https-inspection`

Constraints:
- Do not replace the repo's existing MCP server architecture.
- Reuse `packages/infra` and `packages/mcp-utils`.
- Stay in TypeScript and existing Nx/workspace/package patterns.
- Avoid unrelated refactors.
- Treat write operations as safety-sensitive.

Expected behavior:
- Explicit action-oriented tool names
- Strong Zod validation
- Clear request payload mapping
- Clear text responses with success/failure and next-step hints
- No auto-publish or auto-install unless the user explicitly asks for it

Recommended v1 scope:
- Follow `recommended-scope.md`

Shared expectations:
- Keep planning files current during implementation.
- Update `progress.md`, `task-checklist.md`, and `decision-log.md` as work progresses.

Before broadening scope:
- Revalidate API support from primary sources
- Record the scope expansion in `decision-log.md`
