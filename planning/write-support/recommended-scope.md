# Recommended Write Scope

## v1 Recommendation

### Management
Recommended initial tools:
- `add_host`
- `set_host`
- `add_network`
- `set_network`
- `add_address_range`
- `set_address_range`
- `add_dns_domain`
- `set_dns_domain`
- `add_group`
- `set_group`
- `add_service_tcp`
- `set_service_tcp`
- `add_service_udp`
- `set_service_udp`
- `add_service_icmp`
- `set_service_icmp`
- `add_service_icmp6`
- `set_service_icmp6`
- `add_tag`
- `set_tag`
- `add_security_zone`
- `set_security_zone`
- `publish_session`
- `discard_session`

Rationale:
- These map naturally to the object-heavy read surface already present.
- They are lower-risk than policy/rule mutations.
- They fit current package capabilities and existing generic object helpers.

### Threat Prevention
Recommended initial tools:
- `add_threat_profile`
- `set_threat_profile`
- `add_exception_group`
- `set_exception_group`
- `publish_session`
- `discard_session`

Conditional v1 additions if approved:
- `add_threat_exception`
- `set_threat_exception`

Rationale:
- Profiles and exception groups are valuable, scoped, and safer than broad rulebase manipulation.
- Threat exceptions are useful but more policy-coupled and should be added only if desired in first slice.

### HTTPS Inspection
Recommended initial tools:
- `set_https_rule`
- `publish_session`
- `discard_session`

Conditional follow-up if further API confirmation is desired:
- `add_https_rule`
- `delete_https_rule`

Rationale:
- Updating an existing rule is the best-confirmed and lowest-ambiguity first write action.
- Create/delete support should be verified more directly before inclusion if safety is the priority.

## Deferred / Non-goals For First Implementation
- Auto-publish after mutation
- Auto-install policy after mutation
- `install_policy`
- Access rule CRUD in `management`
- NAT rule CRUD
- Threat rule CRUD
- Threat IOC feed / indicator writes until the exact API surface is revalidated
- HTTPS layer CRUD
- Destructive delete tools by default

## Safety Posture
- Default to draft-only mutations unless the user explicitly calls publish.
- Separate mutation tools from publish/install tools.
- Require explicit target identifiers and avoid ambiguous mutation semantics.

## Expanded Scope After User Approval

Date:
- 2026-04-20 UTC

User direction:
- Expand toward full write access and continue filling similar gaps.

Expanded implementation direction:
- Keep the conservative tools already implemented.
- Add broader explicit write tools for:
  - delete counterparts for existing object/profile/group/rule tools
  - policy packages
  - access layers and access rules
  - NAT rules
  - explicit `install_policy`
  - threat exception writes
  - HTTPS rule create/delete
- Add package-scoped mutation-command escape hatches constrained to write-oriented commands so uncovered endpoints can still be exercised intentionally.

Preserved boundaries:
- no auto-publish
- no auto-install
- destructive actions remain explicit
- live validation should continue to prefer draft-only flows unless publish/install is explicitly requested

## Destroy Follow-On Branch

Date:
- 2026-06-03 UTC

Direction:
- Keep non-destructive write support on the existing `ENABLE_WRITE` gate.
- Split persistent delete tooling into a follow-on branch layered on top of write support.
- Require a second explicit startup gate, `ENABLE_DESTROY`, before exposing:
  - named `delete_*` MCP tools
  - `delete-*` write-command escape hatch paths

Boundaries:
- `discard_session` stays under normal write access because it only affects the current unpublished draft.
- `install_policy` stays under normal write access and is not reclassified as destroy behavior.
