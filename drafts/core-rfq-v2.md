# Core candidate phoenix/v0.6-rc.1: RFQv2 only

**Preparation candidate — not a release, supported integration pin or deployment plan.**
The distribution owner directed identity assignment and an integration waiver on
2026-10-16. The [candidate record](../distributions/phoenix/v0.6-rc.1.json) pins
[API 0.5.0](../components/cork-api/0.5.0.json) and its exact released schema.
The 0.6 line declares the covered RFQv1 removal relative to phoenix/v0.5-rc.1.
Integration is waived, not passed; a green verifier is not final cut approval.

## Component and compatibility boundary

| Included core | Binding in this draft |
|---|---|
| Phoenix | Retain `1.4.0-rc.1` and existing chain/address maps |
| Market Registry | Retain `0.6.0` and existing chain/address maps |
| Rollover | Retain `0.2.0` and existing chain/address maps |
| Periphery | Retain `0.2.0-rc.1` and existing chain/address maps |
| API | Released 0.5.0; exact tagged schema and observed production endpoint bound |
| Required indexing infrastructure | Preserve existing decoder evidence; bind the actual build, watch-list, database and deploy compatibility before acceptance |

CLI and MCP become independently released **external clients**, not Distribution
components. The new set contains no CLI/MCP component pin, deployment entry,
binary/package/image checksum, installation dependency or release job. Existing
CLI component records and historical manifests remain intact for readers of those
exact names. Agent and dashboard consumers are not silently removed or recategorized
as components: neither is a component pin in the preceding set; both remain actual
consumer compatibility obligations.

An external client may drive an integration smoke. Record its exact version,
artifact digest and configuration as **test tooling**, not a core pin or channel
certification. Do not make a CLI/MCP release, hosted deployment or packaging job a
prerequisite to cutting core. Retain the underlying RFQ authentication, native
order, fill/settlement, indexing, rollover and contract-binding checks even when a
previous run used a CLI as its driver.

## Verified contract carry-forward — 2026-10-15

Compared with `phoenix/v0.5-rc.1`, the four contract pins and all 80 canonical
contract address entries are identical across Base and Arbitrum. External dependency
addresses and the component records, including ABI references, recorded runtime
codehashes, proxy implementation bindings and signing domains, are unchanged.

| Component | Retained release | Canonical address entries across both chains |
|---|---|---|
| Phoenix | [1.4.0-rc.1](../components/phoenix/1.4.0-rc.1.json) | 28 |
| Market Registry | [0.6.0](../components/market-registry/0.6.0.json) | 22 |
| Rollover | [0.2.0](../components/rollover/0.2.0.json) | 28 |
| Periphery | [0.2.0-rc.1](../components/cork-periphery/0.2.0-rc.1.json) | 2 |

Each public release tag still resolves to the source commit in its component
record. No newer contract release was published at this check. The canonical
order adapter remains `0x960Cd94B31121806b1b0Ff02230D189Ad0310616`; its replacement
of the earlier adapter occurred in the preceding Distribution, not this draft.
This comparison does not establish unchanged live chain state: no fresh compile,
remote procedure call (RPC) read or independent audit was performed.

API 0.5.0 was released on 2026-10-16 as a private prerelease with an
engineer-signed, GitHub-verified annotated tag. Production reports 0.5.0; its
live schema structurally equals the frozen 45-path snapshot. The source merge
is GitHub/web-flow-signed; exact-version independent review is not established.
The public component deliberately omits private source identifiers and Release
URLs. No implementation-image attestation or whole-core acceptance is claimed.
The identity is now phoenix/v0.6-rc.1. The owner newly approved integration
waiver D1 for this exact set; no earlier waiver is copied and no PASS is claimed.

## Breaking API support

Retire the full RFQv1 surface: reads, writes, answers, counterproposals,
negotiation/retry operations and both canonical and version-first URL spellings.
RFQv2 is the sole RFQ major; this is **not** removal of all `/v1` APIs.
Legacy RFQ rows stay in the database. Existing retained archives and linked
financial citations stay intact; no replacement public history endpoint, row
rewrite, data migration or complete archive export is required by this change.
HTTP retirement does not cancel independent signed orders or migrate signatures.

API 0.4.3 and 0.4.6 historically promised RFQ major 1 and are not relabelled.
Their living supersededBy fields now point to 0.5.0, so the verifier treats them
as historical service records while retaining immutable checks and schemas.
The shared service serves RFQv2 only. Retirement notices and consumer/history
acceptance remain open; supersession does not satisfy those obligations.

## Replace pending API bindings only after actual promotion

Each unchecked item blocks the cut. No command here authorizes promotion, live
access, deployment, publication or changing another repository.

- [x] Obtain the actual completed development-to-main promotion identity. Bind
  the exact merged source/tree and release-owner evidence; never follow a moving
  branch automatically. Check preservation of cumulative order accounting and
  discovery, shutdown ownership, additive effective expiry and authenticated
  rollover role/quote citations. Resolve any production-only delta explicitly.
- [x] Obtain the component owner's final breaking version and real immutable tag,
  Release record, declared artifact channels, signature and review evidence. Do
  not derive a version from this sentinel or use the old version with new semantics.
- [x] Export OpenAPI from that exact released source. Verify byte identity and
  self-declared version; vendor under the real version and compute its digest.
  Verify removal of every RFQv1 operation, RFQv2 coverage and preservation of
  unrelated documented operations. Run the per-family breaking schema diff.
- [x] Record the covered interface artifact and digest, private provenance
  boundary, signature, review level and covered/excluded channels. Hosted
  interface only: no implementation image or image attestation is certified.
- [ ] Obtain separately authorized deployment readbacks: exact served identity,
  component/version metadata, RFQv2-only route map, structural live schema
  compatibility, core contract bindings and infrastructure build/watch-list/event
  layouts on both listed chains. Verify production-equivalent database roles,
  actual deploy command, interruption and tested recovery without deleting rows.
- [x] Replace the API draft record with a new real component file and newly
  exported evidence. Update the new Distribution's API pin and deployment URLs
  from observed bindings. Preserve the existing API `0.4.6` record and schema.
  Remove the untagged preparation record only as part of this completed cutover.
- [x] Assign phoenix/v0.6-rc.1 under the owner direction of 2026-10-16. The
  covered RFQv1 removal advances the pre-1.0 minor line; the candidate suffix
  remains. Rename the draft file with the identity; historical records stay intact.
- [x] Resolve the two sentinels through the assigned identity and newly approved
  exact-set integration waiver D1. Retain passed=false and waived=true; record
  per-component nearest evidence, recurrence, owner and structural exit.

## Integration waiver D1 — owner-approved 2026-10-16

Applies only to partner-preview, unreviewed phoenix/v0.6-rc.1 with the five core
pins and Base/Arbitrum deployment maps in the candidate record. The owner accepts
the missing whole-set integration run for this bounded candidate. Component smokes
and registry checks are nearest evidence, not an end-to-end pass.

This is recurrence 5 after count 4 on phoenix/v0.5-rc.1. The structural exit is a
repository-contained exact-pin runner with reproducible passing RFQ-to-order,
fill/settlement and relevant indexing/rollover results on both chains. Owner:
integration-runner maintainer; coordinator: distribution owner. The existing
2026-10-15 target is overdue and is not extended by this decision.

No notice, policy-alignment, consumer/history, independent-review, rollout/recovery
or final-approval waiver is granted. Before cut completion, affected component
Release bodies must link the candidate deviations. This draft update does not
edit those Releases, publish a Distribution, move stable pointers or authorize a merge.

## Core cut gates still open

| Gate | Required evidence before cut acceptance |
|---|---|
| Scope and policy alignment | Align the independently released client boundary with the current covered-surface policy; owner direction is not a policy amendment or accepted waiver |
| Removal notice and usage | Required notices, posted/effective dates, usage assessment and consumer support disposition; no date or completed notification is asserted here |
| Component completeness | Actual runtime dependencies and final core targets; infrastructure provenance cannot be replaced with an invented public pin |
| Core verification | Contract runtime/implementation identities, external dependencies, indexer coverage and event-layout safety; all existing checks remain |
| API and state compatibility | Real RFQv2 signed/key operations, redaction, replay/conflicts, retained citations and legacy rows, unchanged unrelated routes and supported old/new state combinations |
| Consumers | Actual selected dashboard, collector and installed client contracts; unavailable/error responses must not become empty history or successful migration |
| Integration | Exact-set run is explicitly waived by D1, not passed; keep the candidate suffix and record runner follow-up and per-component nearest evidence |
| Release and recovery | Exact-source artifacts, production-equivalent rollout/interruption/recovery, required signatures and explicit release authority |
| Independent review | Independent provenance and component-owner review of exact versions; author inspection is not independent approval |
| Final acceptance | Full public-byte review, owner approval, release discovery pointers and separately authorized post-publication readbacks |

## Verification boundary

The existing workflow runs offline tests followed by registry verification. It
contains no CLI/MCP-specific build, install or release job. The verifier still
checks historical client records because their frozen promises remain valid; that
is not a requirement for the new core set to ship a client. Contract, API and
infrastructure checks are unchanged. No production schema or validator is relaxed.

Previous verification on 2026-10-16 after CI evidence corrections: all 36 offline tests
passed. The unchanged real verifier reported 354 PASS, zero FAIL, 10 INFO and
7 SKIP. The historical API 0.4.3/0.4.6 live assertions are skipped explicitly
through their living supersededBy fields; frozen fields and schemas are unchanged.
The current worker was resolved to exact source and its real registry executed:
all 85 published decoder rows and the retained event layouts match, including
indexed/anonymous flags and nested tuples. Only build commitments changed.
That prior-head verifier exited 1 for the two unresolved identity/decision fields.
The owner has now resolved them through identity assignment and an explicit waiver;
the CI workflow and verifier remain unchanged. Source-layout proof is not an
independent provenance audit, handler-accounting review or rollout acceptance.

After the identity and owner-approved waiver update, npm test passes all 36 tests.
The unchanged real npm run verify exits 0: 354 PASS, zero FAIL, 10 INFO and
6 SKIP (historical APIs). No unresolved draft record remains. These results
verify registry consistency and observed surfaces, not the waived whole-set run
or the separately open cut-acceptance gates above.
