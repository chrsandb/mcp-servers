# Proposed Architecture Changes

## Files Expected To Change

Shared:
- `packages/infra/src/index.ts`
- `packages/infra/src/mutation-utils.ts` (new)

Management:
- `packages/management/src/index.ts`
- `packages/management/src/write-tools.ts` or `packages/management/src/write-tools/*.ts` (new)

Threat Prevention:
- `packages/threat-prevention/src/index.ts`
- `packages/threat-prevention/src/write-tools.ts` (new)

HTTPS Inspection:
- `packages/https-inspection/src/index.ts`
- `packages/https-inspection/src/write-tools.ts` (new)

Possible test/config additions if approved later:
- package-local test files
- minimal Jest config if needed

## Shared Helper Candidates

Add only small reusable helpers:
- `formatMutationResult(...)`
- `formatMutationError(...)`
- `buildNextStepHints(...)`
- optional small validation helpers for name/uid exclusivity

Do not centralize:
- full Check Point write schemas
- policy-specific request builders
- package-specific rule semantics

## Package-Local Responsibilities

Management:
- object-specific request payload mapping
- session publish/discard tool definitions
- any object family grouping

Threat Prevention:
- threat profile payload mapping
- exception group / exception payload mapping

HTTPS Inspection:
- https rule update payload mapping
- future rule create/delete mapping if approved

## Recommended Implementation Order
1. Shared mutation formatting helpers in `packages/infra`
2. Session-level publish/discard tools
3. Management object writes
4. Threat prevention profile and exception-group writes
5. HTTPS rule update tool
6. Tests

## Why This Structure
- Minimizes churn in shared packages
- Keeps target package logic readable
- Avoids making already-large `management/src/index.ts` even harder to navigate
