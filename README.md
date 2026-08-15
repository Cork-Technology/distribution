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
every component version they pin must exist as a component file here.
The indexing layer is checked against the watch-list the indexer itself declares
(`/indexing/v1/status`): every pinned deployment of an indexed contract type must be on
the watch-list (FAIL), every event topic the indexer consumes for that type must exist in
the component's pinned ABIs — the type's own contract first, with a component-wide
fallback for shared lifecycle events the indexer declares on types that never emit them;
a fallback resolution is named in the PASS row (FAIL when a topic exists in no pinned
ABI — catches wrong-ABI-generation decoding at cut time), the watch-list's
version labels are compared as WARN (a label is a flag, not proof), and the indexer's own
watchdog verdicts report per pinned chain.
Rows holding `TODO` placeholders report as SKIP, never PASS. Non-zero exit on any mismatch.

These files are hand-written for now and verified against the chain at every cut. Once a
manifest generator exists, it becomes the only writer.

## Approval

Frozen fields enter this repository through a pull request, and a cut is approved when the
distribution owner approves that pull request with verification green. The review record and
the signed commits are the audit trail. No manifest carries a signature field: nothing in
this repository is taken on assertion, and that includes approvals.

## Plain-language disclaimer

`partner-preview` stage and `unreviewed` review level mean exactly what they say: no
production support commitment attaches, and the code has not passed independent review.
Read the `stage`, `reviewLevel` and `support` fields of the exact name you pin — fresh from
this repo, never from a bundled copy.
