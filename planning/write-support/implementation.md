# Implementation Notes

This file is the durable implementation record for the write-support effort.

Keep it updated whenever any of the following change:
- code structure
- tool coverage
- request/response behavior
- validation behavior
- known gaps
- verification status

## Status

Date:
- 2026-04-21 UTC

Current state:
- The implementation is no longer limited to the original conservative v1 slice.
- The current code supports broad write access across the three target packages, while still keeping publish and install as explicit caller-controlled steps.
- Write-capable tools are now disabled by default and are only registered when the package `server-config.json` declares `ENABLE_WRITE` and startup config explicitly enables it with `ENABLE_WRITE=true` or `--enable-write`.
- No auto-publish behavior was introduced.
- No auto-install behavior was introduced.
- Local dependencies are installed in this workspace with `npm ci`.
- Local build and Jest coverage are in place for the touched packages.
- Live validation is partial but positive:
  - management draft object creation was validated
  - management draft package creation was validated
  - threat-prevention live create validation was environment-blocked
  - HTTPS live rule validation was environment-blocked

## Files Changed

Shared:
- `packages/infra/src/index.ts`
- `packages/infra/src/mutation-utils.ts`
- `packages/infra/src/mutation-utils.test.ts`
- `packages/infra/jest.config.cjs`

Management:
- `packages/management/src/index.ts`
- `packages/management/src/server-config.json`
- `packages/management/src/server-config.test.ts`
- `packages/management/src/write-tools.ts`
- `packages/management/src/write-tools.test.ts`
- `packages/management/README.md`
- `packages/management/jest.config.cjs`
- `packages/management/package.json`
- `packages/management/tsconfig.json`

Threat Prevention:
- `packages/threat-prevention/src/index.ts`
- `packages/threat-prevention/src/server-config.json`
- `packages/threat-prevention/src/server-config.test.ts`
- `packages/threat-prevention/src/write-tools.ts`
- `packages/threat-prevention/src/write-tools.test.ts`
- `packages/threat-prevention/README.md`
- `packages/threat-prevention/jest.config.cjs`
- `packages/threat-prevention/package.json`
- `packages/threat-prevention/tsconfig.json`

HTTPS Inspection:
- `packages/https-inspection/src/index.ts`
- `packages/https-inspection/src/server-config.json`
- `packages/https-inspection/src/server-config.test.ts`
- `packages/https-inspection/src/write-tools.ts`
- `packages/https-inspection/src/write-tools.test.ts`
- `packages/https-inspection/README.md`
- `packages/https-inspection/jest.config.cjs`
- `packages/https-inspection/package.json`
- `packages/https-inspection/tsconfig.json`

Planning updates tied to implementation:
- `planning/write-support/task-checklist.md`
- `planning/write-support/progress.md`
- `planning/write-support/decision-log.md`
- `planning/write-support/guardrails.md`
- `planning/write-support/test-strategy.md`
- `planning/write-support/publish-description.md`

## Shared Design

### `packages/infra/src/mutation-utils.ts`

Shared helpers were added instead of introducing a larger generic write framework.

Functions:
- `loadWriteEnableConfig(configPath)`
  - reads a package `server-config.json` for the startup write gate
- `isWriteEnabled(config, env, argv)`
  - returns `false` when `ENABLE_WRITE` is missing from the JSON config
  - returns `true` only for strict `ENABLE_WRITE=true` values or the configured `--enable-write` flag
- `pickDefinedEntries(input)`
  - removes keys with `undefined` values before sending payloads to Check Point APIs
- `assertWriteCommand(command, options)`
  - normalizes explicit write-command escape hatch names
  - rejects unsafe command path characters and traversal-like input
  - allows `install-policy` only when the caller opts in
- `assertNoRawPayloadConflicts(args, protectedKeys)`
  - rejects `raw_payload` overrides of protected target-routing fields such as `name`, `uid`, `layer`, and `rule-number`
- `buildNextStepHints(options)`
  - produces next-step guidance, currently focused on explicit publish/install reminders
- `formatMutationResult(options)`
  - returns stable JSON text for mutation responses

Types:
- `MutationTarget`
- `MutationResultOptions`

Response behavior:
- mutation responses consistently include:
  - `success`
  - `action`
  - `target`
  - `uid`
  - `name`
  - `task_id`
  - `next_steps`
  - raw API `response`

Why this stays shared and small:
- all three target packages need the same response-shaping behavior
- package-local tool modules still own endpoint selection and argument validation
- this avoids over-abstracting a broad Check Point write surface too early

Shared sanitization behavior:
- `packages/infra/src/string-utils.ts` preserves empty arrays when sanitizing API payloads
- `null`, `undefined`, and empty strings are still dropped
- this allows collection fields to be cleared when the Check Point API accepts empty-array clear semantics

## Package Wiring

Each target package imports and registers a package-local write-tool module from its `src/index.ts`.

Registration calls:
- `registerManagementWriteTools(server, serverModule)`
- `registerThreatPreventionWriteTools(server, serverModule)`
- `registerHttpsInspectionWriteTools(server, serverModule)`

Pattern preserved:
- package-local MCP tool registration
- `SessionContext.getAPIManager(...)`
- direct `apiManager.callApi('POST', ...)`
- text responses returned through MCP tool handlers

Management-specific typecheck note:
- `packages/management/src/index.ts` hit a TypeScript deep-instantiation issue during `build:tsc`
- the current implementation works around that by registering prompts through a local `const promptServer: any = server`
- this is a type-system workaround only; runtime behavior is unchanged

## Management Implementation

File:
- `packages/management/src/write-tools.ts`

### Internal helpers

Helpers in use:
- `requireMutableFields(...)`
- `buildCommonPayload(args)`
- `getDomain(args)`
- `getRequiredNameOrUid(args)`
- `assertWriteCommand(command)`
- `runMutation(...)`
- `runWriteCommand(...)`
- `registerSessionTools(...)`

`buildCommonPayload(args)` maps shared convenience fields:
- `color`
- `comments`
- `tags`
- `ignore_warnings` -> `ignore-warnings`
- `ignore_errors` -> `ignore-errors`

`runMutation(...)` behavior:
- gets the session-aware API manager
- executes `apiManager.callApi('POST', uri, payload, domain)`
- returns standardized text output through `formatMutationResult(...)`
- defaults to explicit publish reminders in `next_steps`

`runWriteCommand(...)` behavior:
- only allows explicit write-oriented commands
- passes the normalized safe command returned by shared validation to `callApi`
- accepts:
  - `add-*`
  - `set-*`
  - `delete-*`
  - `publish`
  - `discard`
  - `install-policy`

### Session tools

Implemented:
- `publish_session`
- `discard_session`

Behavior:
- package-local registration
- optional `domain`
- direct `publish` / `discard` API call
- response returned through `formatMutationResult(...)`

`publish_session` note:
- explicitly reminds the caller that policy installation is still a separate step

### Management object tools

Implemented object tools:
- `add_host`
- `set_host`
- `delete_host`
- `add_network`
- `set_network`
- `delete_network`
- `add_address_range`
- `set_address_range`
- `delete_address_range`
- `add_dns_domain`
- `set_dns_domain`
- `delete_dns_domain`
- `add_group`
- `set_group`
- `delete_group`
- `add_service_tcp`
- `set_service_tcp`
- `delete_service_tcp`
- `add_service_udp`
- `set_service_udp`
- `delete_service_udp`
- `add_service_icmp`
- `set_service_icmp`
- `delete_service_icmp`
- `add_service_icmp6`
- `set_service_icmp6`
- `delete_service_icmp6`
- `add_tag`
- `set_tag`
- `delete_tag`
- `add_security_zone`
- `set_security_zone`
- `delete_security_zone`

Convenience coverage on the object tools includes:
- object identifiers through `name` and, for update/delete flows, `uid`
- type-specific convenience fields such as host IP fields, network masks, group membership, service ports, and ICMP fields
- common fields from `buildCommonPayload(...)`
- `raw_payload`

Validation behavior:
- `set_*` and `delete_*` flows require `name` or `uid`
- `set_*` flows require at least one mutation field or `raw_payload`
- `set_package` requires at least one mutation field or `raw_payload`
- `add_network` requires either:
  - `subnet` plus `subnet_mask`
  - `subnet` plus `mask_length`
  - or `raw_payload`
- `add_address_range` requires either:
  - a complete IPv4 range
  - a complete IPv6 range
  - or `raw_payload`
- `raw_payload` must not override protected target-routing fields supplied as named fields

### Broader management policy tools

Implemented:
- `add_package`
- `set_package`
- `delete_package`
- `install_policy`
- `add_access_layer`
- `set_access_layer`
- `delete_access_layer`
- `add_access_rule`
- `set_access_rule`
- `delete_access_rule`
- `add_nat_rule`
- `set_nat_rule`
- `delete_nat_rule`
- `management__write_command`

Design note:
- these policy/rule tools intentionally expose a smaller convenience schema and rely more heavily on `raw_payload`
- this keeps the MCP surface usable now without guessing every endpoint-specific field shape

Behavior note:
- `install_policy` exists, but remains explicit and caller-invoked
- `management__write_command` is an escape hatch, but still restricted to explicit write commands through `assertWriteCommand(...)`

### Raw payload behavior

All management write tools support:
- `raw_payload`

Purpose:
- allows callers to pass through additional documented Check Point API fields
- avoids hardcoding guessed field coverage for every endpoint
- lets explicit convenience fields coexist with broader endpoint reach

Merge behavior:
- convenience fields are assembled first
- `raw_payload` is spread last
- caller-supplied raw keys can override non-target convenience mappings if needed
- caller-supplied raw keys cannot override protected target-routing fields supplied as named args

### Mocked integration coverage

Tests in `packages/management/src/write-tools.test.ts` currently verify:
- write tools register successfully
- `add_host` maps payload and forwards `domain`
- `set_network` rejects missing identifiers
- `publish_session` calls the `publish` endpoint
- `delete_package` maps to the expected delete endpoint
- `management__write_command` rejects non-write commands
- `management__write_command` rejects path traversal-like command names
- `management__write_command` forwards normalized safe command names
- `management__write_command` uses normalized `install-policy` for install-specific next-step guidance
- `set_package` rejects identifier-only no-op updates
- raw payload identity conflicts are rejected

## Threat Prevention Implementation

File:
- `packages/threat-prevention/src/write-tools.ts`

### Internal helpers

Helpers in use:
- `getDomain(args)`
- `buildCommonPayload(args)`
- `getRequiredNameOrUid(args)`
- `assertWriteCommand(command)`
- `runMutation(...)`
- `registerSessionTools(...)`

`buildCommonPayload(args)` maps:
- `comments`
- `color`
- `tags`
- `ignore_warnings` -> `ignore-warnings`
- `ignore_errors` -> `ignore-errors`

`assertWriteCommand(command)` allows:
- `add-*`
- `set-*`
- `delete-*`
- `publish`
- `discard`

Policy installation note:
- `install-policy` is intentionally excluded from threat-prevention write-command escape hatches
- callers must use management `install_policy` or `management__write_command`

### Session tools

Implemented:
- `publish_session`
- `discard_session`

Behavior:
- optional `domain`
- direct `publish` / `discard` management API calls
- standardized mutation response text

### Threat prevention tools

Implemented:
- `add_threat_profile`
- `set_threat_profile`
- `delete_threat_profile`
- `add_exception_group`
- `set_exception_group`
- `delete_exception_group`
- `add_threat_exception`
- `set_threat_exception`
- `delete_threat_exception`
- `threat-prevention__write_command`

Convenience coverage:
- threat profiles:
  - `name`
  - `uid` for update/delete flows
  - shared common fields
  - `raw_payload`
- exception groups:
  - `name`
  - `uid` for update/delete flows
  - `profile`
  - `protections`
  - shared common fields
  - `raw_payload`
- threat exceptions:
  - intentionally narrower convenience handling
  - `raw_payload` is the main path for richer endpoint-specific payloads

Validation behavior:
- `set_threat_profile` requires `name` or `uid`
- `set_threat_profile` requires at least one update field or `raw_payload`
- `set_exception_group` requires `name` or `uid`
- `set_exception_group` requires at least one update field or `raw_payload`
- `set_threat_exception` requires an identifier and at least one update field or `raw_payload`
- delete flows require `name` or `uid`
- `raw_payload` must not override protected target-routing fields supplied as named fields

### Mocked integration coverage

Tests in `packages/threat-prevention/src/write-tools.test.ts` currently verify:
- `add_exception_group` maps payload and forwards `domain`
- `set_threat_profile` rejects empty updates
- `discard_session` calls the `discard` endpoint
- `delete_threat_profile` maps to the expected delete endpoint
- `threat-prevention__write_command` rejects path traversal-like command names
- `threat-prevention__write_command` rejects `install-policy`
- `set_threat_exception` rejects identifier-only no-op updates
- raw payload target conflicts are rejected

## HTTPS Inspection Implementation

File:
- `packages/https-inspection/src/write-tools.ts`

### Internal helpers

Helpers in use:
- `getDomain(args)`
- `assertWriteCommand(command)`

`assertWriteCommand(command)` allows:
- `add-*`
- `set-*`
- `delete-*`
- `publish`
- `discard`

Policy installation note:
- `install-policy` is intentionally excluded from HTTPS inspection write-command escape hatches
- callers must use management `install_policy` or `management__write_command`

### Session tools

Implemented:
- `publish_session`
- `discard_session`

### HTTPS write tools

Implemented:
- `set_https_rule`
- `add_https_rule`
- `delete_https_rule`
- `https-inspection__write_command`

Convenience coverage:
- rule targeting:
  - `uid`
  - `rule_number`
  - `layer`
- common rule fields:
  - `enabled`
  - `action`
  - `comments`
  - `track`
  - `certificate`
  - `source`
  - `destination`
  - `services`
  - `site_category`
- `raw_payload`
- `domain`

Validation behavior:
- `set_https_rule` requires `uid` or `rule_number`
- `set_https_rule` requires `layer` when using `rule_number`
- `set_https_rule` requires at least one mutation field or `raw_payload`
- `add_https_rule` requires `layer`, either as a named field or inside `raw_payload`
- `delete_https_rule` requires `uid` or `rule_number`
- `delete_https_rule` requires `layer` when using `rule_number`
- `raw_payload` must not override protected target-routing fields supplied as named fields

Response behavior:
- returns formatted mutation output with target details for:
  - rule `uid`
  - `layer`
  - `ruleNumber`

### Mocked integration coverage

Tests in `packages/https-inspection/src/write-tools.test.ts` currently verify:
- `set_https_rule` maps rule-number-based payloads correctly
- `set_https_rule` enforces `layer` when called with `rule_number`
- `delete_https_rule` maps uid-based deletes correctly
- `https-inspection__write_command` rejects path traversal-like command names
- `https-inspection__write_command` rejects `install-policy`
- `add_https_rule` rejects missing `layer`
- raw payload target conflicts are rejected

## Verification Status

### Local dependency status

Completed:
- `npm ci`

Result:
- local workspace dependencies are installed
- local `tsc` and `jest` binaries are available

### Build status

Verified for touched packages:
- `packages/mcp-utils`
- `packages/infra`
- `packages/management`
- `packages/threat-prevention`
- `packages/https-inspection`

Management-specific note:
- a TypeScript deep-instantiation error in prompt registration was resolved with the local `promptServer: any` workaround described above

### Test status

Revalidated on 2026-04-21 UTC:
- `packages/infra`: 1 suite passed, 10 tests passed
- `packages/management`: 2 suites passed, 12 tests passed
- `packages/threat-prevention`: 2 suites passed, 9 tests passed
- `packages/https-inspection`: 2 suites passed, 8 tests passed

Coverage character:
- `packages/infra` has focused unit coverage for shared mutation helpers
- target packages have mocked integration-style tests for tool registration, payload mapping, and key guardrails
- target packages have config tests confirming `ENABLE_WRITE` is declared with default `false`
- coverage is useful but still selective, not exhaustive

### Live validation status

Temporary environment used:
- hostname: `demop2tfxlsg5v.mgmt.cloud`

Known environment note:
- the endpoint TLS certificate was expired during validation
- curl-based checks required insecure TLS bypass

Validated successfully:
- management login
- draft host creation, readback, discard, and post-discard absence check
- draft OT-style network creation, readback, discard, and post-discard absence check
- draft policy package creation, readback, discard, and post-discard absence check
- full MCP-backed create-and-publish flow for a temporary OT example:
  - created network `codex-ot-demo-20260420d-network`
  - created package `codex-ot-demo-20260420d-package`
  - used the generated access layer `codex-ot-demo-20260420d-package Network`
  - created and published an access rule in that layer
  - confirmed the published package, network, and top rule from a fresh read session

Environment-blocked:
- threat-profile live create validation
  - server returned an async task failure:
  - `Profile operation is currently running, cannot run another operation.`
- HTTPS rule live update validation
  - the demo environment did not expose an obvious safe rule target in the probed response

## Current Gaps

Remaining gaps are no longer basic package or rule creation gaps. The current gaps are more about depth and validation quality:
- convenience schemas are still intentionally shallow for several advanced endpoints
- full IP/subnet format validation is still deferred pending Check Point API compatibility review
- some complex policy and rule operations currently depend on `raw_payload`
- `*_write_command` tools broaden capability but are less guided than first-class dedicated tools
- live validation is still incomplete for threat-prevention and HTTPS inspection flows
- install-policy exists only in `management`; there is still no auto-install workflow, by design
- automated tests do not yet cover every newly added write tool or every negative validation branch

## Bottom Line

`implementation.md` should describe the current codebase as broad explicit write support with explicit publish/install boundaries, not as a conservative object-only v1. If this file drifts again, update it whenever tool coverage, validation results, or the safety model changes.
