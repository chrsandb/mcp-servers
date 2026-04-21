# Task Checklist

Current phase:
- [x] Clone and inspect repository
- [x] Map shared infra and MCP patterns
- [x] Review target packages
- [x] Verify likely write-capable API surface
- [x] Prepare planning workspace
- [x] Confirm final v1 scope with user
- [x] Start implementation

Shared implementation tasks:
- [x] Add shared mutation result helper(s) in `packages/infra`
- [x] Decide whether publish/discard helpers are shared or package-local
- [x] Add/update minimal test foundation if needed
- [x] Add shared helpers if needed for broader delete/install/write-command coverage
- [x] Add shared safe write-command validation helper
- [x] Add shared raw-payload target-conflict helper
- [x] Preserve empty arrays in shared API payload sanitization
- [x] Add shared `ENABLE_WRITE` startup gate helper

Management tasks:
- [x] Define exact object family list for v1
- [x] Add package-local write tool helpers
- [x] Add create/update object tools
- [x] Add publish/discard tools if included here
- [x] Add tests
- [x] Add delete counterparts for current object tools
- [x] Add package write tools
- [x] Add access-layer write tools
- [x] Add access-rule write tools
- [x] Add NAT rule write tools
- [x] Add explicit `install_policy`
- [x] Add management write-command escape hatch
- [x] Add expanded tests
- [x] Harden management write-command path validation
- [x] Add `set_package` no-op update validation
- [x] Add raw-payload target-conflict coverage
- [x] Gate write tool registration behind `ENABLE_WRITE`

Threat Prevention tasks:
- [x] Confirm whether threat exceptions are in v1
- [x] Add threat profile tools
- [x] Add exception group tools
- [x] Add threat exception tools if approved
- [x] Add publish/discard tools if included here
- [x] Add tests
- [x] Add delete counterparts for current threat tools
- [x] Add threat exception delete support
- [x] Add threat write-command escape hatch
- [x] Add expanded tests
- [x] Harden threat-prevention write-command path validation
- [x] Add `set_threat_exception` no-op update validation
- [x] Add raw-payload target-conflict coverage
- [x] Gate write tool registration behind `ENABLE_WRITE`

HTTPS Inspection tasks:
- [x] Confirm whether update-only or create/delete are included
- [x] Add `set_https_rule`
- [x] Add publish/discard tools if included here
- [x] Add tests
- [x] Add `add_https_rule`
- [x] Add `delete_https_rule`
- [x] Add HTTPS write-command escape hatch
- [x] Add expanded tests
- [x] Harden HTTPS write-command path validation
- [x] Require `layer` for `add_https_rule`
- [x] Add raw-payload target-conflict coverage
- [x] Gate write tool registration behind `ENABLE_WRITE`

Validation tasks:
- [x] Typecheck/build touched packages
- [x] Run unit tests
- [x] Run mocked integration tests
- [x] Add config tests for disabled-by-default write access
- [x] Prepare optional live sanity-check checklist
- [ ] Add full IP/subnet format validation if Check Point API-compatible forms are confirmed
