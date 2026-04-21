# Test Strategy

## Layer 1: Static Validation
- `npm run build`
- target package `build:tsc` runs for:
  - management
  - threat-prevention
  - https-inspection
- lint only if already operational for the touched packages

## Layer 2: Unit Tests
Focus:
- Zod schema validation
- payload construction
- mutation result formatting
- error formatting/mapping
- small helper utilities

Suggested approach:
- use Jest because the repo already carries Jest dependencies
- keep tests near the touched packages or in shared helper packages

## Layer 3: Mocked Integration Tests
Mock/stub:
- `SessionContext.getAPIManager(...)`
- `apiManager.callApi(...)`

Verify:
- tool handler accepts expected arguments
- generated method is correct
- endpoint URI is correct
- payload mapping is correct
- `domain` parameter is passed through correctly
- mutation response formatting is stable
- write-command escape hatches reject traversal-like command names
- `raw_payload` cannot override protected target-routing fields
- write access stays disabled unless `server-config.json` declares `ENABLE_WRITE` and startup config explicitly enables it

## Layer 4: Manual / Live Sanity Checks
Optional final stage only.

Use a real management server later to validate:
- create/update object
- publish session
- update threat profile
- update HTTPS rule

Keep this out of routine CI/local validation.

Current live-validation status:
- management draft-only object validation completed successfully on the temporary demo environment
- management MCP-backed package/network/rule create-and-publish validation completed successfully on the temporary demo environment
- threat-profile live validation is currently blocked by an environment-side running profile operation
- HTTPS rule live validation is currently blocked by lack of an obvious available rule target in the demo environment response
- the demo environment currently serves an expired TLS certificate, so curl-based validation required insecure certificate bypass

## Minimal Test Foundation
If no strong repo test setup exists when implementation starts:
- add the smallest possible Jest config
- avoid introducing new test frameworks
- prefer targeted tests over broad harnesses

Current implementation status:
- Added a minimal Jest config at `packages/infra/jest.config.cjs`
- Added targeted unit tests for `packages/infra/src/mutation-utils.ts`
- Confirmed the shared-helper test suite passes locally
- Added package-local Jest configs for:
  - `packages/management`
  - `packages/threat-prevention`
  - `packages/https-inspection`
- Added mocked integration-style tests for write-tool registration, validation, endpoint selection, payload mapping, and `domain` forwarding
- Confirmed the current mocked integration suites pass locally for all three target packages
- Added security regression coverage for safe write-command validation and raw-payload target-conflict rejection
- Added sanitizer coverage confirming empty arrays are preserved while nullish and empty-string values are still dropped
- Added strict `ENABLE_WRITE` parsing coverage and package config tests confirming disabled-by-default write access
- Latest local focused suite results:
  - infra: 1 suite passed, 10 tests passed
  - management: 2 suites passed, 12 tests passed
  - threat-prevention: 2 suites passed, 9 tests passed
  - https-inspection: 2 suites passed, 8 tests passed

## Special Validation Notes
- `publish` and `install-policy` may be async/task-based and need response handling tests if added.
- For MDS, add mocked verification that `domain` is forwarded rather than reimplementing routing logic locally.
- Full IP/subnet format validation is intentionally deferred until accepted Check Point API input forms are confirmed.
