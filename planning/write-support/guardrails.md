# Guardrails

## Safety
- Prefer non-destructive mutations first.
- Keep write-capable tools disabled by default.
- Only expose write-capable tools when the package `server-config.json` declares `ENABLE_WRITE` and startup config explicitly enables it.
- Only expose delete-capable tools when the package `server-config.json` declares `ENABLE_DESTROY` and startup config explicitly enables it.
- Do not auto-chain:
  - mutation -> publish
  - publish -> install
  - mutation -> install
- Surface next-step requirements explicitly instead.
- For broader write access, keep destructive and policy-impacting actions explicit and individually named wherever practical.
- If a generic write-command tool is added, constrain it to explicit mutation-oriented command names instead of arbitrary API execution.
- Keep `delete-*` write-command paths disabled unless destroy access is explicitly enabled.

## UX
- Use explicit, unambiguous tool names.
- Require enough identifying information to avoid accidental mutation of the wrong entity.
- Prefer `name` or `uid` patterns only when they match existing repo conventions.
- Return readable confirmations, not only raw JSON.
- When API parameter coverage is incomplete, allow explicit user-supplied passthrough fields instead of guessing undocumented convenience arguments.

## Architecture
- Reuse `apiManager.callApi(...)`.
- Keep session handling and MDS routing in shared infra.
- Use small shared helpers only when duplicated across multiple target packages.
- Avoid introducing a generic write framework for its own sake.

## Scope Control
- Start with lower-risk objects/profiles/rule updates.
- Defer high-impact operations until requested and justified.
- Record scope changes in `decision-log.md`.
- The user has now requested broader/full write access, so higher-impact operations are in scope as long as safety boundaries remain explicit.
- Persistent delete operations now have a stricter gate than ordinary writes and should remain absent from tool discovery unless `ENABLE_DESTROY` is enabled.

## Process
- Keep this planning workspace updated as work proceeds.
- Do not let important decisions exist only in chat history.
- If the live server or product version support becomes relevant, document it before implementation assumptions harden.
