# distribution

Distribution manifests — the pinned component sets partners integrate against: versions,
addresses, codehashes, review levels. Nothing here is a token distribution, an airdrop, or an
allocation of any kind.

The rules this repository follows are stated in this README in full — no other document
is needed to read or verify anything here.

## What this repo is

A database keyed by name — never a versioned artifact. A reader holds an exact name (a
component version like `phoenix 1.3.0-rc.1`, or a Distribution like `phoenix/v0.1-rc.1`),
fetches the one file for that name, and gets everything the name resolves to. Tools that must
work offline bundle generated projections instead; they never vendor these files.

Two kinds of file:

- **`components/<component>/<version>.json`** — one component version: what exists (source
  repo, tag, package), where it runs (per-chain deployment rows with address, codehash,
  deployed commit), and how much review it carries. Contract ABIs sit next to it in
  `components/<component>/abi/`. An explicit `null` under a chain ID means: the suite serves
  that chain, and this contract does not. A missing row would invite the reader to assume.
  A hosted-service component carries no contracts; instead it pins its base URL under
  `services` and vendors its OpenAPI document at the pinned version under
  `components/<component>/schema/` — the source repo may be private, but the full interface
  is always in this repository.
- **`distributions/<line>/<point>.json`** — one Distribution: which component versions were
  tested together, what the cut changed per surface, and where the Distribution stands now.
  Each name in its `components` map is a key into a per-component file in this repo.

**`stable/<line>`** holds one pointer per Distribution line, naming the newest production
Distribution on that line. No pointer file exists until a production Distribution does.

### Distribution names and CLI generations

A Distribution name identifies a component set; a CLI generation label selects deployed
contracts. They need not be identical. Consult the Distribution manifest for its generation
mapping and the CLI component record for recognized configuration keys. Selecting a
generation does not migrate positions, approvals, signatures or orders.

Coverage is explicit in each Distribution manifest. A CLI binary pin can cover its Model
Context Protocol (MCP) stdio server without certifying hosted deployments, software
development kits or container images.

### Candidate names and permanent addresses

Non-disposable deployments freeze the address set, not the name. Later candidates
on that frozen set may update off-chain pins. Fresh addresses or covered breaking
changes require the next Distribution number; below 1.0, covered breaks advance
the minor line even when the deployments stay fixed. A candidate suffix drops
only when the frozen pinned set passes integration on every listed chain. A
waiver is not a pass. `promotedFrom` remains `null` on candidates and is written
when the name goes plain. Stage changes do not rename a Distribution.

### Periphery update candidate — phoenix/v0.7-rc.1

[phoenix/v0.7-rc.1](distributions/phoenix/v0.7-rc.1.json) pins
[Periphery 0.3.0-rc.1](components/cork-periphery/0.3.0-rc.1.json) and its new
combined adapter at `0xe64F5deCEC381cd8C705f20B41BB24213b8a3507` on Base and
Arbitrum. It adds caller-bound rollover and destination-market creation paths;
existing function entries remain unchanged, while the constructor expands from
three addresses to six. The public-tag build matches both full deployed runtimes
and mined creation inputs. All other component pins and 78 contract addresses
are retained from phoenix/v0.6-rc.1.

The previous adapter stays deployed; this candidate does not migrate approvals,
positions or orders or activate consumers. It remains partner-preview and
unreviewed. Whole-set integration has not passed and is not waived; the prior
candidate's waiver does not apply to the new pin and addresses. Its unresolved
integration decision deliberately blocks successful cut verification.
The deployed worker's 2026-10-27 registry/layout review is recorded in
`scripts/indexing-evidence.json`; its bounded correspondence does not establish
handler-accounting, running-image provenance or whole-set integration.

**API release update pending:** on 2026-10-27 the hosted API metadata and
component header reported `0.6.0`; as checked on 2026-10-30, its tag and Release
still do not exist.
The candidate therefore retains the frozen [API 0.5.0](components/cork-api/0.5.0.json)
pin and schema, **not a claim that its authentication promise still holds**.
The live schema retains 45 paths, but wallet-signed RFQv2 writes now bind proofs
to the venue origin. The actual production origin and any temporary legacy-proof
deadline remain unverified; matching schema shapes do not prove compatibility.
The candidate's `knownIssues` records the release, signed-writer migration,
notice/history, recovery and PostHog disclosure/privacy evidence still required.
No API 0.6.0 component record or schema is committed before the tag exists.

CLI, MCP and SDKs are independently released external consumers, not pinned
components or certified artifacts of this candidate. Their independent release,
installation, hosted-deployment and artifact-acceptance workflows are not
Distribution merge gates; their release exceptions are not imported here.
Compatibility with covered API and contract surfaces remains in scope, including
existing signed proofs, selected generations, supported actions, notices and
support dispositions. A client used to exercise an integration scenario is
identified in that scenario's evidence; that does not certify or activate it.
This candidate changes no consumer defaults or authorizations.

Release/tag checks on 2026-10-30 found no newer Phoenix, Market Registry,
Rollover or Periphery version than this candidate's four contract pins.

#### Review and merge decisions

This candidate is available for review, **not ready to merge on a general
approval alone**. Before merge:

- Resolve the API release/pin and covered signing-compatibility mismatch above.
  An exact-tag component record and schema are required for any new API pin;
  neither a source version stamp nor matching schema shapes replaces them.
- Replace the `integrationSuite.decision` placeholder with passing exact-set
  evidence on both chains or a newly, explicitly accepted waiver. A waiver must
  name the exact set, nearest evidence, rationale, recurrence, structural exit
  condition, follow-up owner and date. Keep `passed=false`, `waived=false` until
  the corresponding evidence or owner decision exists; do not remove the
  placeholder merely to make CI green.
- Obtain independent provenance review and moved-component owner sign-off,
  dispose of applicable release limitations and findings, and obtain final cut
  approval. Periphery's source Release follow-ups were due 2026-10-29; its
  [published record](https://github.com/Cork-Technology/cork-periphery/releases/tag/v0.3.0-rc.1)
  has no resolution addendum as checked on 2026-10-30. Client-release exceptions
  do not resolve them.
- Resolve every remaining `knownIssues` gate with evidence or an explicitly
  accepted, scoped deviation, including API notices/history and consumer
  compatibility, API/worker telemetry privacy, and indexing rollout identity,
  database/native-client TLS, accounting and interruption/recovery.

#### Required indexing runtime — 2026-10-27 rollout

Indexing infrastructure was already part of core runtime scope; this candidate
does not invent a new worker component version or change the contract/API pins.
The production rollout moved the worker to Node 24.22.1 with pinned trust roots,
the `/usr/local/bin/node` executable path, PostHog tracking and bounded fatal-error
handling. The migration guard reported matching code/database heads, captured
chains were restarted, and hosted status showed healthy Base/Arbitrum progress.
The candidate's `scopeNotes` records these point-in-time rollout observations.

Identity between the tested image and deployed runtime has not been independently
established. Database/native-client TLS, in-flight processing/accounting and
interruption/rollback acceptance remain separate gates.
The deployment installed production telemetry settings; effective kill switches
and actual exported-data filtering remain unverified. API tracking evidence does
not cover worker tracking, and a deploy annotation is not privacy acceptance.

Decoder identity/layout evidence is recorded separately in
[`scripts/indexing-evidence.json`](scripts/indexing-evidence.json).
The exact reported worker's registry and row builder were executed without a
database: all 85 declarations across 15 types match the fresh hosted declaration,
and all 31 required full event layouts match retained and pinned ABI evidence.
Only the reviewed build commitments change; handler accounting is outside this
proof. The earlier candidate CI result predates the rollout; only a post-rollout
verification run describes the resulting deployed set.

### Previous core candidate — phoenix/v0.6-rc.1

The [next core draft](drafts/core-rfq-v2.md) proposes RFQv2-only API support and
a core Distribution of contracts, API and required indexing infrastructure.
CLI/MCP become independently released external clients, not new core component,
artifact, installation or release requirements. Historical records below keep
their original client pins and promises.

The [candidate set](distributions/phoenix/v0.6-rc.1.json) retains the existing
four contract pins and deployment maps. It now pins [API 0.5.0](components/cork-api/0.5.0.json),
its exact tagged schema and the observed production endpoint. RFQv2 is the only
RFQ major; unrelated v1 route families remain. Legacy rows and financial citations
remain stored without a replacement public history API. API 0.4.3 and 0.4.6
are explicitly superseded by 0.5.0; their frozen RFQv1 schemas remain historical.
Supersession does not establish completed retirement notices or history acceptance.

The distribution owner assigned phoenix/v0.6-rc.1 and explicitly approved its
integration waiver on 2026-10-16. The minor-line bump declares the RFQv1 removal;
the candidate suffix remains because integration has not passed. D1 records
passed=false, waived=true, recurrence 5, nearest evidence and the structural exit.
The existing 2026-10-15 follow-up target is overdue, not extended. No other waiver
is inherited. This draft is not published or approved for rollout; policy alignment,
notices, consumer compatibility, independent review and final cut approval remain open.

### Previous review candidate

[phoenix/v0.5-rc.1](distributions/phoenix/v0.5-rc.1.json) pins CLI 0.7.0,
API 0.4.6 and Market Registry 0.6.0. The 0.5 line reflects covered RFQ
(request-for-quote) v2 input/output breaks. Follow the
[tagged CLI migration guide](https://github.com/Cork-Technology/cork-cli/blob/v0.7.0/docs/cli.md#12-migrate-from-06-to-07)
for authenticated writes, required RFQ kind and full signed quoted-answer orders.
Live CLI `config/0.7` selects active `phoenix/v0.5` on Base and Arbitrum, mapped
to this Distribution. Explicit `phoenix/v0.4-rc.1` is read-only with the original
adapter. The tagged fallback still selects its older label with the replacement
adapter; failed remote fetches can therefore resolve differently. See the CLI
component record for the separate source commits and configuration digests.
Existing orders are not automatically migrated. CLI 0.7.0 is a version-only update
from the preceding CLI candidate: runtime code and tagged fallback bytes are
unchanged. The later live configuration update does not promote the Distribution.

The tag, configuration and released binary provenance are verified. Exact-version
independent reviews remain pending. Integration and the listed verification gaps
are waived under D10/D15 for this exact candidate, not passed. Worker-build
checks use SHA-256 commitments to preserve identity without publishing private
source identifiers; event-layout and watch-list checks are unchanged. Read the
manifest deviations and component records for evidence and remaining gates.

## Frozen vs living fields

Frozen fields — source tag, addresses, codehashes, ABIs, schema pointers, the pinned set —
are written at the cut and never change; they are the cut. Living fields — `stage`,
`reviewLevel`, `badges`, `status`, `support`, `supersededBy` — are expected to change after
the cut: same file, same name, frozen fields byte-identical, and the repo's history is the
record. A living fact changing never mints a new version or a new Distribution.

## Verifying

```
npm install && npm run verify
```

CI runs the same check on every pull request, on every push to main, and once a day —
the manifests claim living facts (deployed code, running services, public tags), so they
are re-verified even when nobody is editing.

Every component is verified by what it is: contract rows against a fresh on-chain read
(code must exist at the address, its keccak256 must match the row's `codeHash`, and a
proxy's EIP-1967 slot must resolve to the row's `implementation`); service components
live under the availability model (`GET /v1/meta` must name the pinned component and serve
a version at or above the pin — a hosted service keeps shipping non-breaking releases
after the cut by rule, so equality is never asserted; every covered route family in the
pin's `routeMajors` must still be served at its pinned major; and the live OpenAPI
document must show no breaking drift against the vendored snapshot on covered paths —
a removed path or method, a newly-required parameter, or a newly-required JSON body
field);
pure-artifact components against their public tag (it must resolve to the pinned commit).
A pin with `supersededBy` set is a historical record: its live-service assertions are
skipped, its immutable checks keep running. Distribution files are checked structurally:
each referenced component file must parse and declare the requested component and version.
The indexing layer is checked against the watch-list the indexer itself declares
(`/indexing/v1/status`): every pinned deployment of an indexed contract type must be on
the watch-list with the correct chain/address/type (FAIL). Phoenix event topics must exist in
the union of the component’s non-superseded pinned ABIs — the type’s own contract
first, with a component-wide fallback for shared lifecycle events. Each fallback
names its lender pin and contract; a topic absent from every live pin is FAIL.
Registry, Rollover and external LOP also check required events and indexed/tuple layouts;
reviewed event layouts and shared decoders are recorded in `scripts/indexing-evidence.json`.
The worker commit is an opaque build identifier, not a public source citation; its
implementation cannot be independently inspected from that identifier. Missing mappings
or required evidence fail. A changed worker cannot pass live layout verification without
new reviewed layout evidence; the API does not pin the worker or publish layouts.
Refreshing that evidence requires re-deriving the subscribed event ABIs from the exact
reported worker build and checking indexed flags, anonymous flags and nested tuple
components against the pinned contracts. Changing the worker identifier alone is not
evidence. A layout review does not certify handler accounting, database behavior or
cross-component integration.

Historical coverage gaps remain failures.
The watch-list’s
version labels are compared as WARN (a label is a flag, not proof), and the indexer's own
watchdog verdicts report per pinned chain.
Draft records may use `0.0.0-untagged.*`, `MOCK(owner): ...`, or legacy `TODO` sentinels.
Unresolved fields report as SKIP, never PASS; any sentinel-bearing record blocks a successful
verification exit. Known contract addresses and runtime hashes are still checked, and indexer
coverage failures remain FAIL. Release-dependent service and ABI checks stay unresolved until
their inputs exist. Historical service SKIPs alone do not block verification.
Run `npm test` for offline negative tests of these gates.
No sentinel-bearing draft is a published Distribution or a supported integration pin.

These files are hand-written for now and verified against the chain at every cut. Once a
manifest generator exists, it becomes the only writer.

## Approval

Frozen fields enter this repository through a pull request, and a cut is approved when the
distribution owner approves that pull request with verification green. The review record and
the signed commits are the audit trail. No manifest carries a signature field: nothing in
this repository is taken on assertion, and that includes approvals.

Green CI establishes mechanical verification, not human approval. Completed checks and
owner-accepted deviations may remove draft sentinels while independent provenance and
component-owner reviews remain explicit pre-merge requirements on the pull request.

## Plain-language disclaimer

`partner-preview` stage and `unreviewed` review level mean exactly what they say: no
production support commitment attaches, and the code has not passed independent review.
Read the `stage`, `reviewLevel` and `support` fields of the exact name you pin — fresh from
this repo, never from a bundled copy.
