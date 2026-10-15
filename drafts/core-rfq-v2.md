# Next core Distribution: RFQv2 only

**Preparation draft — not a release, supported integration pin or deployment plan.**
No Distribution number or actual API component version is assigned here. The
[draft record](../distributions/phoenix/draft-core-rfq-v2.json) and
[untagged API record](../components/cork-api/0.0.0-untagged.rfq-v2.json) use the
registry's existing unresolved sentinels. They must block a successful release
verification. A green test suite is not a green cut.

## Component and compatibility boundary

| Included core | Binding in this draft |
|---|---|
| Phoenix | Retain `1.4.0-rc.1` and existing chain/address maps |
| Market Registry | Retain `0.6.0` and existing chain/address maps |
| Rollover | Retain `0.2.0` and existing chain/address maps |
| Periphery | Retain `0.2.0-rc.1` and existing chain/address maps |
| API | Explicitly pending actual promotion and breaking component release |
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

## Breaking API support

Retire the full RFQv1 surface: reads, writes, answers, counterproposals,
negotiation/retry operations and both canonical and version-first URL spellings.
RFQv2 is the sole RFQ major; this is **not** removal of all `/v1` APIs.
Legacy RFQ rows stay in the database. Existing retained archives and linked
financial citations stay intact; no replacement public history endpoint, row
rewrite, data migration or complete archive export is required by this change.
HTTP retirement does not cancel independent signed orders or migrate signatures.

API `0.4.6` still promises RFQ major 1 and must not be relabelled RFQv2-only.
A development branch, an unmerged proposal or its smoke results are not proof of
promotion, present deployment or release artifact identity. No fallback to the
old API makes this draft deployable.

## Replace pending API bindings only after actual promotion

Each unchecked item blocks the cut. No command here authorizes promotion, live
access, deployment, publication or changing another repository.

- [ ] Obtain the actual completed development-to-main promotion identity. Bind
  the exact merged source/tree and release-owner evidence; never follow a moving
  branch automatically. Check preservation of cumulative order accounting and
  discovery, shutdown ownership, additive effective expiry and authenticated
  rollover role/quote citations. Resolve any production-only delta explicitly.
- [ ] Obtain the component owner's final breaking version and real immutable tag,
  Release record, declared artifact channels, signature and review evidence. Do
  not derive a version from this sentinel or use the old version with new semantics.
- [ ] Export OpenAPI from that exact released source. Verify byte identity and
  self-declared version; vendor under the real version and compute its digest.
  Verify removal of every RFQv1 operation, RFQv2 coverage and preservation of
  unrelated documented operations. Run the per-family breaking schema diff.
- [ ] Record the real promoted artifact/image identity and digest, build-to-source
  provenance and covered/excluded channels in the actual release evidence. Do
  not insert dummy hashes, predicted artifacts or private source identifiers.
- [ ] Obtain separately authorized deployment readbacks: exact served identity,
  component/version metadata, RFQv2-only route map, structural live schema
  compatibility, core contract bindings and infrastructure build/watch-list/event
  layouts on both listed chains. Verify production-equivalent database roles,
  actual deploy command, interruption and tested recovery without deleting rows.
- [ ] Replace the API draft record with a new real component file and newly
  exported evidence. Update the new Distribution's API pin and deployment URLs
  from observed bindings. Preserve the existing API `0.4.6` record and schema.
  Remove the untagged preparation record only as part of this completed cutover.
- [ ] Obtain owner selection of a Distribution name that declares the covered
  breaking change. Replace the draft identity and filename together; regenerate
  or verify the per-surface report. Never overwrite a historical Distribution.
- [ ] Remove every unresolved sentinel only when its cited evidence exists.
  Re-run verification on the exact changed bytes; do not remove blockers merely
  to obtain green CI. No previous candidate's waiver carries into this set.

## Core cut gates still open

| Gate | Required evidence before cut acceptance |
|---|---|
| Scope and policy alignment | Align the independently released client boundary with the current covered-surface policy; owner direction is not a policy amendment or accepted waiver |
| Removal notice and usage | Required notices, posted/effective dates, usage assessment and consumer support disposition; no date or completed notification is asserted here |
| Component completeness | Actual runtime dependencies and final core targets; infrastructure provenance cannot be replaced with an invented public pin |
| Core verification | Contract runtime/implementation identities, external dependencies, indexer coverage and event-layout safety; all existing checks remain |
| API and state compatibility | Real RFQv2 signed/key operations, redaction, replay/conflicts, retained citations and legacy rows, unchanged unrelated routes and supported old/new state combinations |
| Consumers | Actual selected dashboard, collector and installed client contracts; unavailable/error responses must not become empty history or successful migration |
| Integration | Whole-core RFQ-to-order/fill/settlement and relevant indexing/rollover proof on Base and Arbitrum; no successful run or waiver is asserted |
| Release and recovery | Exact-source artifacts, production-equivalent rollout/interruption/recovery, required signatures and explicit release authority |
| Independent review | Independent provenance and component-owner review of exact versions; author inspection is not independent approval |
| Final acceptance | Full public-byte review, owner approval, release discovery pointers and separately authorized post-publication readbacks |

## Verification boundary

The existing workflow runs offline tests followed by registry verification. It
contains no CLI/MCP-specific build, install or release job. The verifier still
checks historical client records because their frozen promises remain valid; that
is not a requirement for the new core set to ship a client. Contract, API and
infrastructure checks are unchanged. No production schema or validator is relaxed.

The draft intentionally makes `npm run verify` non-successful through existing
recursive sentinel detection. That command also performs live reads and must not
be run without the appropriate access authorization. Offline tests and an
isolated, network-denied execution of the actual verifier can demonstrate the
pending-API rejection; they cannot establish live release acceptance. Publication
of a draft PR is not permission to merge this blocked preparation record.
