# Decision Log

## 2026-04-20

Decision:
- Create a repo-local planning workspace instead of keeping the context only in chat.

Why:
- The user explicitly wants durable research, prompt framing, guardrails, and progress tracking.

Decision:
- Recommend a conservative v1 focused on low-risk writes rather than broad policy mutation.

Why:
- The repo currently has no write-tool precedent in the target packages.
- The target packages are read-oriented.
- Safety and consistency matter more than feature count.

Decision:
- Keep detailed planning under `planning/write-support/` and add a top-level `AGENTS.md`.

Why:
- Makes the context discoverable for future Codex work without scattering files across unrelated docs locations.

Open questions:
- Should delete operations be excluded entirely from v1?
- Should `publish_session` be included in v1, or should first implementation stop at draft-only mutations?
- Should `install_policy` be deferred completely?
- Should Threat Prevention v1 include threat exceptions or stop at profiles and exception groups?
- Should HTTPS Inspection v1 be update-only?
- Is a live management server available later for sanity checks?

Assumptions currently in force:
- No auto-publish or auto-install behavior.
- No destructive scope by default.
- Minimal shared-helper additions only.

Decision:
- Treat the user's "execute plan" request as approval to implement the conservative v1 scope already documented in `recommended-scope.md`.

Why:
- The repo-local planning workspace already defined a low-risk default.
- The user asked to both get familiar with the project and execute the plan, without requesting scope expansion.

Decision:
- Keep publish/discard registration package-local even though they share similar handler logic.

Why:
- This matches the existing per-package MCP registration style.
- It avoids adding a broader shared write framework prematurely.

Decision:
- Add a `raw_payload` escape hatch to new write tools alongside validated convenience fields.

Why:
- The Check Point write APIs have broader per-endpoint parameter surfaces than can be safely hardcoded from local repo context alone.
- This preserves safety by keeping identifiers explicit while avoiding guessed field mappings that could be wrong.
- It lets future iterations tighten schemas without blocking initial write support.

Decision:
- Add `planning/write-support/implementation.md` and treat it as the primary durable record of implementation details.

Why:
- The user explicitly asked for implementation documentation in the planning workspace.
- The existing planning files track scope and progress well, but they do not centralize the concrete code-level implementation details in one place.
- This gives future work a stable place to update whenever code changes land.

Decision:
- Expand from the conservative v1 scope toward broad/full write access after the user explicitly requested it.

Why:
- The user asked to continue and fill similar gaps with the goal of full write access.
- This changes the earlier conservative-scope assumption, so the planning workspace must reflect the broader direction before implementation continues.

Decision:
- Preserve explicit safety boundaries while broadening scope by adding:
  - explicit named destructive tools where practical
  - explicit install tools rather than auto-install behavior
  - package-scoped write-command escape hatches for mutation verbs

Why:
- Full Check Point write coverage is broad, and hardcoding every mutation endpoint immediately would slow delivery.
- An explicit mutation-oriented escape hatch can extend reach without silently allowing arbitrary API behavior.

Decision:
- Harden write-command escape hatches with a shared validator that returns a normalized safe command string.

Why:
- Prefix allowlisting alone allowed unsafe path characters after an allowed prefix.
- Passing the normalized command to `callApi` prevents the original caller string from bypassing validation.
- Management is the only package allowed to opt in to `install-policy`.

Decision:
- Reject `raw_payload` overrides of protected target-routing fields supplied through named tool arguments.

Why:
- `raw_payload` remains useful for broad Check Point API coverage.
- Target identity fields such as `name`, `uid`, `layer`, and rule numbers should not be silently retargeted by passthrough payloads.

Decision:
- Preserve empty arrays in shared API payload sanitization.

Why:
- Empty arrays may be needed to clear collection fields.
- Dropping them made clear attempts become silent no-ops.

Decision:
- Defer full IP/subnet format validation.

Why:
- Check Point APIs may accept multiple object/address formats beyond simple IPv4/IPv6 strings.
- This should be a separate compatibility-focused validation pass rather than a quick hardening change.

Decision:
- Gate write-capable MCP tool registration behind the package `server-config.json` option `ENABLE_WRITE`.

Why:
- Write access should be disabled by default and absent from MCP tool discovery unless explicitly enabled.
- Tying the gate to `server-config.json` means packages that do not declare `ENABLE_WRITE` remain read-only even if the environment variable is set globally.
- The gate accepts only strict `true` env values, plus the configured `--enable-write` startup flag, to avoid accidental enablement from broad truthy strings.

## 2026-06-03

Decision:
- Split persistent delete support from ordinary write support behind a second startup gate, `ENABLE_DESTROY`.

Why:
- `ENABLE_WRITE` had become too broad once it exposed persistent delete operations alongside ordinary draft mutations.
- A second explicit gate keeps delete tools out of MCP discovery for default write-enabled deployments.
- `discard_session` remains under ordinary write access because it only reverts the current unpublished draft.
