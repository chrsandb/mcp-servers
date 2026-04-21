# Patterns To Preserve

Code structure:
- Keep using `createMcpServer`, `createServerModule`, and `launchMCPServer`.
- Keep session-aware API access through `SessionContext.getAPIManager(...)` or `createApiRunner(...)`.
- Keep per-package MCP tools close to existing package style.

Naming:
- Follow existing MCP tool naming: snake_case aligned to the API command.
- Use package prefixes only where the existing package already uses them.
- Prefer names like:
  - `add_host`
  - `set_host`
  - `publish_session`
  - `set_threat_profile`
  - `set_https_rule`

Validation:
- Use inline Zod schemas or small package-local schema helpers.
- Match existing parameter naming at the MCP layer:
  - mostly snake_case
  - map to hyphenated API fields in request payloads

API execution:
- Reuse `apiManager.callApi(method, uri, data, domain)`.
- Keep MDS/domain routing in shared infra, not in per-tool custom logic.

Responses:
- Continue returning MCP `text` content.
- For writes, prefer concise confirmation text plus JSON payload when useful.
- Explicitly include:
  - action attempted
  - target object/rule/profile
  - success state
  - returned identifiers if available
  - next-step hints such as publish/install

Boundaries:
- Avoid introducing a new generic mutation framework unless the duplication is clearly repetitive.
- Prefer small additive helpers in `packages/infra` only if reused by multiple target packages.
- Keep highly domain-specific payload shaping package-local.

Non-goals:
- No unrelated refactors.
- No transport/auth/session redesign.
- No large-scale decomposition of existing read-only packages unless needed for maintainability of the new write tools.
