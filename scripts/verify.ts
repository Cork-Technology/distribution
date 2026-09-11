/**
 * Verify every manifest against reality.
 *
 * Each component is verified by what it is:
 *  - contract rows against a fresh on-chain read: code must exist at the
 *    address, keccak256 of the runtime code must equal the row's codeHash,
 *    and a proxy's EIP-1967 implementation slot must resolve to the row's
 *    implementation;
 *  - service components live under the availability model: the running
 *    component name must match the pin, the served version must be >= the
 *    pinned version (a lower version is a rollback nobody recorded), every
 *    covered route family in services.routeMajors must still be served at
 *    its pinned major, and the live OpenAPI document must show no breaking
 *    drift against the vendored snapshot on the covered paths (a removed
 *    path/method, or a newly-required parameter or body field). A hosted
 *    service with one
 *    live deployment keeps shipping non-breaking releases after the cut by
 *    rule (R10), so equality with the served version is never asserted;
 *  - pure-artifact components against their public tag: it must resolve to
 *    the pinned commit.
 *
 * A component pin with supersededBy set is a historical record: its live
 * service assertions are skipped (the endpoint has moved on with the newer
 * pin), while its immutable checks (tags, on-chain rows) keep running.
 *
 * Distribution files are checked structurally: every component version a
 * distribution pins must exist as a component file in this repository.
 *
 * Draft sentinels report as SKIP, never PASS, and block a successful cut check.
 * deployedCommit is recorded provenance, not on-chain verifiable — it is
 * echoed, not checked. Exit code is non-zero on any FAIL or unresolved record.
 *
 * Usage: npm run verify
 * RPC overrides via env: RPC_42161, RPC_8453 (defaults are public endpoints).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sha3 from "js-sha3";
const { keccak_256 } = sha3;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const RPCS: Record<string, string> = {
  "42161": process.env.RPC_42161 ?? "https://arb1.arbitrum.io/rpc",
  "8453": process.env.RPC_8453 ?? "https://mainnet.base.org",
};

const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

type Result = ["PASS" | "FAIL" | "SKIP" | "NULL" | "WARN" | "INFO", string, string];

/**
 * Component-name -> indexer contract-type mapping (the one piece of static
 * glue the indexing checks need; it lives here because component names exist
 * only in this repository). `contract` is the row whose address the indexer
 * watches; `abiContract` is where its events live when the watched address
 * is a proxy. A pinned contract absent from this map is not indexed — the
 * indexing checks report it as INFO, never FAIL.
 */
const INDEXED_CONTRACTS: Array<{
  type: string;
  component: string;
  contract: string;
  abiContract?: string;
}> = [
  { type: "CORK_ADAPTER", component: "phoenix", contract: "CorkAdapter" },
  { type: "CORK_CONSTRAINT_RATE_ADAPTER", component: "phoenix", contract: "ConstraintRateAdapterProxy", abiContract: "ConstraintRateAdapterImplementation" },
  { type: "CORK_CONTROLLER", component: "phoenix", contract: "DefaultCorkController" },
  { type: "CORK_POOL_MANAGER", component: "phoenix", contract: "CorkPoolManagerProxy", abiContract: "CorkPoolManagerImplementation" },
  { type: "CORK_SHARES_FACTORY", component: "phoenix", contract: "SharesFactory" },
  { type: "CORK_WHITELIST_MANAGER", component: "phoenix", contract: "WhitelistManagerProxy", abiContract: "WhitelistManagerImplementation" },
];

/** Canonical event signature (tuples flattened) -> topic0. */
function eventTopic0(ev: { name: string; inputs?: any[] }): string {
  const flat = (input: any): string =>
    input.type.startsWith("tuple")
      ? `(${(input.components ?? []).map(flat).join(",")})${input.type.slice(5)}`
      : input.type;
  return "0x" + keccak_256(`${ev.name}(${(ev.inputs ?? []).map(flat).join(",")})`);
}

const isUnresolved = (v: unknown): boolean =>
  typeof v === "string" && (v.includes("TODO") || v.startsWith("MOCK(") || /^0\.0\.0-untagged(?:[.-]|$)/.test(v));

function unresolvedPaths(value: unknown, path = ""): string[] {
  if (isUnresolved(value)) return [path];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    unresolvedPaths(child, path ? `${path}.${key}` : key));
}

async function rpc(url: string, method: string, params: unknown[]): Promise<string> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const out = (await resp.json()) as { result?: string; error?: unknown };
  if (out.error) throw new Error(`${method} ${JSON.stringify(params)}: ${JSON.stringify(out.error)}`);
  return out.result as string;
}

async function verifyRow(
  component: string,
  contract: string,
  chainId: string,
  row: Record<string, unknown>,
): Promise<Result> {
  const label = `${component}/${contract} @ ${chainId}`;
  if (isUnresolved(row.address) || isUnresolved(row.codeHash))
    return ["SKIP", label, "row holds TODO placeholders"];
  const url = RPCS[chainId];
  if (!url) return ["FAIL", label, `no RPC configured for chain ${chainId}`];
  const code = await rpc(url, "eth_getCode", [row.address, "latest"]);
  if (!code || code === "0x" || code === "0x0")
    return ["FAIL", label, `no code at ${row.address}`];
  const got = "0x" + keccak_256(Buffer.from(code.slice(2), "hex"));
  if (got.toLowerCase() !== String(row.codeHash).toLowerCase())
    return ["FAIL", label, `codehash mismatch: chain ${got}, manifest ${row.codeHash}`];
  const impl = row.implementation as string | null;
  if (impl && !isUnresolved(impl)) {
    const slot = await rpc(url, "eth_getStorageAt", [row.address, EIP1967_IMPL_SLOT, "latest"]);
    const onchain = "0x" + slot.slice(-40);
    if (onchain.toLowerCase() !== impl.toLowerCase())
      return ["FAIL", label, `EIP-1967 impl mismatch: chain ${onchain}, manifest ${impl}`];
  }
  const pending = unresolvedPaths(row);
  if (pending.length) return ["SKIP", label, `runtime hash matches; unresolved ${pending.join(", ")}`];
  const commit = String(row.deployedCommit ?? "?").slice(0, 8);
  return ["PASS", label, `code ${code.length / 2 - 1} bytes, commit ${commit}`];
}

/**
 * Compare two semver-ish versions (x.y.z with an optional -rc.N suffix).
 * Returns <0, 0, >0 — or NaN when either version is unparseable (missing,
 * garbage, or a stray v-prefix). NaN compares false against everything, so
 * callers must assert the passing condition (`>= 0`), never the failing one:
 * an unparseable version has to fail closed.
 */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split("-", 2);
    const nums = core.split(".").map((n) => parseInt(n, 10));
    const preNum = pre ? parseInt(pre.replace(/[^0-9]/g, "") || "0", 10) : Infinity;
    return { nums, preNum }; // Infinity = no prerelease = sorts above any rc
  };
  const pa = parse(a), pb = parse(b);
  if (pa.nums.some(Number.isNaN) || pb.nums.some(Number.isNaN)) return NaN;
  for (let i = 0; i < 3; i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d;
  }
  return pa.preNum === pb.preNum ? 0 : pa.preNum < pb.preNum ? -1 : 1;
}

/** The route family of an OpenAPI path under the canonical /<module>/v<n> form, or null. */
function routeFamily(path: string): { module: string; major: number } | null {
  const m = path.match(/^\/([^/]+)\/v(\d+)(\/|$)/);
  return m ? { module: m[1], major: parseInt(m[2], 10) } : null;
}

/**
 * Breaking-drift check of the live OpenAPI against the vendored snapshot,
 * scoped to the covered route families. Breaking means: a covered
 * path+method disappeared, or an operation gained a required parameter or a
 * required JSON body field the snapshot did not have. Additive drift (new
 * paths, new optional fields) passes — that is the point of the availability
 * model. Body comparison reads the inline application/json schema's top-level
 * required list — every covered body is an inline schema today; a $ref here
 * would compare as an empty set, so keep the vendored snapshot inlined.
 */
function breakingDrift(
  pinned: Record<string, any>,
  live: Record<string, any>,
  covered: Record<string, number>,
): string[] {
  const problems: string[] = [];
  for (const [path, ops] of Object.entries<any>(pinned.paths ?? {})) {
    const fam = routeFamily(path);
    if (!fam || covered[fam.module] !== fam.major) continue;
    const liveOps = live.paths?.[path];
    if (!liveOps) {
      problems.push(`covered path removed: ${path}`);
      continue;
    }
    for (const [method, op] of Object.entries<any>(ops)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      const liveOp = liveOps[method];
      if (!liveOp) {
        problems.push(`covered operation removed: ${method.toUpperCase()} ${path}`);
        continue;
      }
      const requiredParams = (params: any[] | undefined) =>
        new Set((params ?? []).filter((p) => p.required).map((p) => `${p.in}:${p.name}`));
      const pinnedReq = requiredParams(op.parameters);
      for (const param of requiredParams(liveOp.parameters)) {
        if (!pinnedReq.has(param))
          problems.push(`new required parameter on ${method.toUpperCase()} ${path}: ${param}`);
      }
      const requiredBodyFields = (o: any) =>
        new Set<string>(o?.requestBody?.content?.["application/json"]?.schema?.required ?? []);
      const pinnedBody = requiredBodyFields(op);
      for (const field of requiredBodyFields(liveOp)) {
        if (!pinnedBody.has(field))
          problems.push(`new required body field on ${method.toUpperCase()} ${path}: ${field}`);
      }
      if (liveOp.requestBody?.required && !op.requestBody?.required)
        problems.push(`request body became required on ${method.toUpperCase()} ${path}`);
    }
  }
  return problems;
}

async function verifyService(doc: Record<string, any>): Promise<Result[] | null> {
  const base: string | undefined = doc.services?.baseUrl;
  if (!base || isUnresolved(base)) return null;
  const label = `${doc.component} ${doc.version} @ ${base}`;
  if (doc.supersededBy)
    return [["SKIP", label, `superseded by ${doc.supersededBy}: historical pin, live service no longer asserted`]];
  let meta: Record<string, unknown>;
  try {
    const resp = await fetch(`${base}/v1/meta`, { signal: AbortSignal.timeout(15000) });
    meta = (await resp.json()) as Record<string, unknown>;
  } catch (exc) {
    return [["FAIL", label, `/v1/meta unreachable: ${exc}`]];
  }
  if (meta.component !== doc.component)
    return [["FAIL", label, `component mismatch: service says ${JSON.stringify(meta.component)}, manifest ${JSON.stringify(doc.component)}`]];
  const served = String(meta.version ?? "");
  if (!(compareVersions(served, String(doc.version)) >= 0))
    return [["FAIL", label, `served version ${JSON.stringify(served)} does not verify as >= the pin ${doc.version}: a rollback, or a version nobody can parse`]];
  const results: Result[] = [
    ["PASS", label, `serves ${meta.component} ${served} >= pinned ${doc.version} (commit ${meta.commit ?? "?"})`],
  ];

  const covered: Record<string, number> | undefined = doc.services?.routeMajors;
  if (!covered) return results;
  const majors = Object.fromEntries(
    Object.entries(covered).filter(([k]) => !k.startsWith("_")),
  ) as Record<string, number>;

  // Every covered route family must still be served at its pinned major:
  // probe one static GET path per family from the vendored snapshot.
  // Auth and validation errors (401/403/422) prove the route exists, so they
  // count as served. A 404 means the family is gone; a 5xx means whatever is
  // answering is not serving it.
  let pinnedSpec: Record<string, any> | null = null;
  if (doc.schema?.openapi) {
    const specPath = join(dirname(join(ROOT, "components", doc.component, "x")), doc.schema.openapi);
    try {
      pinnedSpec = JSON.parse(readFileSync(specPath, "utf8"));
    } catch (exc) {
      results.push(["FAIL", `${doc.component} ${doc.version} pinned schema`, `vendored snapshot unreadable at ${doc.schema.openapi}: ${exc}`]);
    }
  }
  for (const [module, major] of Object.entries(majors)) {
    const familyLabel = `${doc.component}/${module}/v${major} @ ${base}`;
    const candidates = Object.keys(pinnedSpec?.paths ?? {}).filter((p) => {
      const fam = routeFamily(p);
      return fam && fam.module === module && fam.major === major && !p.includes("{") &&
        Boolean(pinnedSpec?.paths[p]?.get);
    });
    const probe = candidates[0] ?? `/${module}/v${major}/`;
    try {
      const resp = await fetch(`${base}${probe}`, { signal: AbortSignal.timeout(15000) });
      if (resp.status === 404) {
        results.push(["FAIL", familyLabel, `covered route family no longer served: GET ${probe} -> 404`]);
      } else if (resp.status >= 500) {
        results.push(["FAIL", familyLabel, `covered route family erroring: GET ${probe} -> ${resp.status}`]);
      } else {
        results.push(["PASS", familyLabel, `served (GET ${probe} -> ${resp.status})`]);
      }
    } catch (exc) {
      results.push(["FAIL", familyLabel, `probe GET ${probe} unreachable: ${exc}`]);
    }
  }

  // The live OpenAPI document must show no breaking drift on covered paths.
  if (pinnedSpec && doc.services?.liveSpec) {
    const driftLabel = `${doc.component} schema drift @ ${base}${doc.services.liveSpec}`;
    try {
      const resp = await fetch(`${base}${doc.services.liveSpec}`, { signal: AbortSignal.timeout(15000) });
      const liveSpec = (await resp.json()) as Record<string, any>;
      const problems = breakingDrift(pinnedSpec, liveSpec, majors);
      if (problems.length > 0) {
        results.push(["FAIL", driftLabel, `breaking drift on covered surface: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ""}`]);
      } else {
        const coveredPaths = Object.keys(pinnedSpec.paths ?? {}).filter((p) => {
          const fam = routeFamily(p);
          return fam && majors[fam.module] === fam.major;
        }).length;
        results.push(["PASS", driftLabel, `live spec (${liveSpec.info?.version ?? "?"}) carries all ${coveredPaths} covered pinned paths, no breaking drift`]);
      }
    } catch (exc) {
      results.push(["FAIL", driftLabel, `live spec unreadable: ${exc}`]);
    }
  }
  return results;
}

async function verifyRelease(doc: Record<string, any>): Promise<Result> {
  const repo: string = doc.source?.repo ?? "";
  const tag: string | undefined = doc.source?.tag;
  const commit: string | undefined = doc.source?.commit;
  const label = `${doc.component} @ ${tag}`;
  if (!repo.startsWith("https://github.com/") || !tag || isUnresolved(tag))
    return ["SKIP", doc.component ?? "?", "no verifiable source pin"];
  const api = repo.replace("https://github.com/", "https://api.github.com/repos/");
  const headers: Record<string, string> = { "user-agent": "distribution-verify" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const ref = (await (await fetch(`${api}/git/ref/tags/${tag}`, { headers })).json()) as any;
    if (!ref.object) throw new Error(JSON.stringify(ref.message ?? ref));
    let { sha, type } = ref.object as { sha: string; type: string };
    if (type === "tag") {
      const tagObj = (await (await fetch(`${api}/git/tags/${sha}`, { headers })).json()) as any;
      sha = tagObj.object.sha;
    }
    if (commit && sha.toLowerCase() !== commit.toLowerCase())
      return ["FAIL", label, `tag resolves to ${sha.slice(0, 12)}, manifest pins ${commit.slice(0, 12)}`];
    return ["PASS", label, `public tag resolves to pinned commit ${sha.slice(0, 12)}`];
  } catch (exc) {
    return ["FAIL", label, `tag unresolvable on public repo: ${exc}`];
  }
}

/**
 * Indexing checks against the live watch-list the indexer declares
 * (services.indexingStatus on the current cork-api pin). Four checks:
 *  1. Coverage (FAIL): every pinned deployment whose type the indexer
 *     declares must be on the watch-list for its chain.
 *  2. Decode safety (FAIL): every topic0 the indexer consumes for a pinned
 *     type must exist in the events of the pinned ABIs — the type's own
 *     contract first, then any contract in the component. The component-wide
 *     fallback exists because the indexer declares OpenZeppelin lifecycle
 *     events (Initialized, Upgraded) on types whose own contract never emits
 *     them; topic0 is derived from the signature alone, so a shared event
 *     resolves identically from any contract. Each component-wide resolution
 *     is named in the PASS row. Catches wrong-ABI-generation decoding at cut
 *     time, named per event.
 *  3. Release label (WARN, never FAIL): the watch-list's contracts_version
 *     label vs the pin — the label comes from the same release notes the pin
 *     does, so a mismatch is a flag, not proof.
 *  4. Freshness (WARN): the indexer's own watchdog verdicts per pinned chain,
 *     plus the decoder-spec publication stamp as INFO.
 * Chains outside the pinned set (mainnet oracles, testnets) are out of scope.
 */
async function verifyIndexing(
  apiDoc: Record<string, any>,
  manifests: Record<string, any>[],
  pinnedChains: string[],
): Promise<Result[]> {
  const results: Result[] = [];
  const statusPath: string | undefined = apiDoc.services?.indexingStatus;
  const base: string | undefined = apiDoc.services?.baseUrl;
  if (!statusPath || !base) return results;
  const label = `indexing @ ${base}${statusPath}`;
  let status: Record<string, any>;
  try {
    const resp = await fetch(`${base}${statusPath}`, { signal: AbortSignal.timeout(15000) });
    status = (await resp.json()) as Record<string, any>;
  } catch (exc) {
    return [["FAIL", label, `indexing status unreachable: ${exc}`]];
  }

  const watching: any[] = status.watching ?? [];
  const declaredTypes = new Set<string>(
    (status.decoders?.contract_types ?? []).map((ct: any) => ct.contract_type ?? ct.type),
  );
  const watchKey = (chain: string | number, addr: string) => `${chain}:${addr.toLowerCase()}`;
  const watchSet = new Map<string, any>(
    watching.map((w) => [watchKey(w.chain_id, w.address), w]),
  );

  for (const doc of manifests) {
    if (doc.supersededBy || !doc.contracts) continue;
    const notIndexed: string[] = [];
    for (const [contract, entry] of Object.entries<any>(doc.contracts)) {
      const mapping = INDEXED_CONTRACTS.find(
        (m) => m.component === doc.component && m.contract === contract,
      );
      if (!mapping || !declaredTypes.has(mapping.type)) {
        notIndexed.push(contract);
        continue;
      }
      // 1. Coverage + 3. Release label, per pinned chain.
      for (const chainId of pinnedChains) {
        const rows = entry.deployments?.[chainId];
        if (!rows) continue;
        for (const row of rows) {
          if (isUnresolved(row.address)) continue;
          const rowLabel = `indexing/${doc.component}/${contract} @ ${chainId}`;
          const w = watchSet.get(watchKey(chainId, String(row.address)));
          if (!w) {
            results.push(["FAIL", rowLabel, `pinned deployment not on the indexer watch-list (type ${mapping.type})`]);
            continue;
          }
          results.push(["PASS", rowLabel, `watched as ${mapping.type}, last confirmed block ${w.last_block_confirmed ?? "?"}`]);
          const expectedLabel = `${doc.component}@${doc.version}`;
          if (w.contracts_version == null) {
            results.push(["WARN", rowLabel, `watch-list carries no contracts_version label (expected ${expectedLabel})`]);
          } else if (w.contracts_version !== expectedLabel) {
            results.push(["WARN", rowLabel, `watch-list labels ${w.contracts_version}, pin is ${expectedLabel} — label is informational, not proof`]);
          }
        }
      }
      // 2. Decode safety is checked once per (component, decoder type) across
      //    every non-superseded pin of that component — see below the loop.
    }
    if (notIndexed.length > 0)
      results.push(["INFO", `indexing/${doc.component}`, `no declared decoder type — out of the indexer's scope: ${notIndexed.join(", ")}`]);
  }

  // 2. Decode safety: every topic0 the indexer consumes for a declared type
  //    must exist in the union of the ABIs of all non-superseded pins of the
  //    component that carries that type. One decoder type serves several ABI
  //    generations while two pins are live (an old Distribution still
  //    consumed, a new one just published), so no single pin has to carry
  //    every topic — but the indexer must not consume a topic that no live
  //    pin emits. Resolution order per topic: the type's own contract in any
  //    live pin, then any contract in any live pin (shared OZ lifecycle
  //    events); the lender pin@contract is named in the PASS row.
  const live = manifests.filter((d) => !d.supersededBy && d.contracts);
  for (const mapping of INDEXED_CONTRACTS) {
    if (!declaredTypes.has(mapping.type)) continue;
    const pins = live.filter((d) => d.component === mapping.component && d.contracts[mapping.contract]);
    if (pins.length === 0) continue;
    const declared = (status.decoders?.contract_types ?? []).find(
      (ct: any) => (ct.contract_type ?? ct.type) === mapping.type,
    );
    if (!declared) continue;
    // An unresolved ABI reference is a placeholder, and a placeholder never
    // contributes to a PASS: the pin is counted, and if every pin's own ABI
    // is a placeholder the row is SKIP.
    const todoPins: string[] = [];
    const loadTopics = (doc: Record<string, any>, names: string[]): Map<string, string> => {
      const topics = new Map<string, string>();
      for (const name of names) {
        const abiRef = doc.contracts[name]?.abi;
        if (!abiRef || isUnresolved(abiRef)) continue;
        const parsed = JSON.parse(readFileSync(join(ROOT, "components", doc.component, abiRef), "utf8"));
        const abi: any[] = Array.isArray(parsed) ? parsed : parsed?.abi ?? [];
        for (const item of abi) if (item.type === "event") topics.set(eventTopic0(item), `${doc.version}/${name}.${item.name}`);
      }
      return topics;
    };
    const own = new Map<string, string>();
    const any = new Map<string, string>();
    for (const doc of pins) {
      const abiNames = [...new Set([mapping.abiContract ?? mapping.contract, mapping.contract])];
      if (abiNames.every((n) => !doc.contracts[n]?.abi || isUnresolved(doc.contracts[n].abi))) todoPins.push(doc.version);
      for (const [t, l] of loadTopics(doc, abiNames)) if (!own.has(t)) own.set(t, l);
      for (const [t, l] of loadTopics(doc, Object.keys(doc.contracts))) if (!any.has(t)) any.set(t, l);
    }
    const missing: string[] = [];
    const borrowed: string[] = [];
    for (const ev of declared.events ?? []) {
      if (own.has(ev.topic0)) continue;
      const lender = any.get(ev.topic0);
      if (lender) { borrowed.push(`${ev.name} from ${lender}`); continue; }
      missing.push(`${ev.name} (${ev.topic0.slice(0, 10)}…)`);
    }
    const versions = pins.map((d) => d.version).join("+");
    const decodeLabel = `indexing/decode ${mapping.type} vs ${mapping.component}@{${versions}}`;
    if (todoPins.length === pins.length) {
      results.push(["SKIP", decodeLabel, `no resolved ABI for ${mapping.contract} in any live pin (${todoPins.join(", ")}): decode safety not asserted`]);
    } else if (missing.length > 0) {
      results.push(["FAIL", decodeLabel, `indexer consumes events absent from every live pinned ABI: ${missing.join(", ")}`]);
    } else {
      const skipped = todoPins.length ? ` (unresolved ABI skipped: ${todoPins.join(", ")})` : "";
      results.push(["PASS", decodeLabel, `all ${(declared.events ?? []).length} consumed topics exist in the live pinned ABIs${borrowed.length ? ` (resolved component-wide: ${borrowed.join(", ")})` : ""}${skipped}`]);
    }
  }

  // 4. Freshness: the indexer's own watchdog verdicts, pinned chains only.
  for (const chain of status.chains ?? []) {
    const chainId = String(chain.chain_id);
    if (!pinnedChains.includes(chainId)) continue;
    const stale = chain.verdicts?.progress?.is_stale || chain.verdicts?.consumption?.is_stale;
    const freshLabel = `indexing/watchdog @ ${chainId}`;
    if (chain.status === "ok" && !stale) {
      results.push(["PASS", freshLabel, `ok, last confirmed block ${chain.facts?.last_block_confirmed ?? "?"}`]);
    } else {
      results.push(["WARN", freshLabel, `watchdog reports status=${chain.status}, stale=${Boolean(stale)} — indexer lag, not an address-pin failure`]);
    }
  }
  const pub = status.decoders?.published_at;
  results.push(["INFO", "indexing/decoders", `spec published_at ${pub ?? "?"}${pub ? ` (${Math.round((Date.now() / 1000 - pub) / 60)}m ago)` : ""}, worker_commit ${status.decoders?.worker_commit ?? "?"}`]);
  return results;
}

async function main(): Promise<number> {
  const componentsDir = join(ROOT, "components");
  const manifests: string[] = [];
  for (const comp of readdirSync(componentsDir)) {
    if (!statSync(join(componentsDir, comp)).isDirectory()) continue;
    for (const f of readdirSync(join(componentsDir, comp))) {
      if (f.endsWith(".json") && !f.startsWith("_")) manifests.push(join(componentsDir, comp, f));
    }
  }
  manifests.sort();
  if (manifests.length === 0) {
    console.error("no component manifests found under components/");
    return 2;
  }

  const results: Result[] = [];
  let unresolvedRecords = 0;
  const docs: Record<string, any>[] = [];
  for (const path of manifests) {
    const doc = JSON.parse(readFileSync(path, "utf8"));
    docs.push(doc);
    const pending = unresolvedPaths(doc);
    if (pending.length) {
      unresolvedRecords++;
      results.push(["SKIP", `${doc.component}@${doc.version} release evidence`, `unresolved ${pending.slice(0, 8).join(", ")}${pending.length > 8 ? ` (+${pending.length - 8} fields)` : ""}`]);
    }
    const serviceResults = pending.length ? null : await verifyService(doc);
    if (serviceResults) results.push(...serviceResults);
    const contracts = doc.contracts;
    if (!contracts || typeof contracts !== "object") {
      if (!serviceResults && pending.length === 0) results.push(await verifyRelease(doc));
      continue;
    }
    for (const [contract, entry] of Object.entries<any>(contracts)) {
      for (const [chainId, rows] of Object.entries<any>(entry.deployments ?? {})) {
        if (rows === null) {
          results.push(["NULL", `${doc.component}/${contract} @ ${chainId}`, "explicit null: suite chain this contract does not serve"]);
          continue;
        }
        for (const row of rows) {
          try {
            results.push(await verifyRow(doc.component, contract, chainId, row));
          } catch (exc) {
            results.push(["FAIL", `${doc.component}/${contract} @ ${chainId}`, String(exc)]);
          }
        }
      }
    }
  }

  // Indexing checks: driven by the current (non-superseded) cork-api pin.
  const apiDoc = docs.find((d) => d.component === "cork-api" && !isUnresolved(d.version) && !d.supersededBy && d.services?.indexingStatus);
  if (apiDoc) {
    const pinnedChains = (apiDoc.services?.chains ?? []).map(String);
    results.push(...(await verifyIndexing(apiDoc, docs, pinnedChains)));
  }

  // Distribution files: every pinned component version must exist as a file.
  const distDir = join(ROOT, "distributions");
  for (const line of readdirSync(distDir)) {
    if (!statSync(join(distDir, line)).isDirectory()) continue;
    for (const f of readdirSync(join(distDir, line))) {
      if (!f.endsWith(".json")) continue;
      const dist = JSON.parse(readFileSync(join(distDir, line, f), "utf8"));
      const pending = unresolvedPaths(dist);
      if (pending.length) {
        unresolvedRecords++;
        results.push(["SKIP", `${dist.distribution} cut evidence`, `unresolved ${pending.join(", ")}`]);
      }
      for (const [comp, version] of Object.entries<string>(dist.components ?? {})) {
        const pinPath = join(componentsDir, comp, `${version}.json`);
        const label = `${dist.distribution} pins ${comp}@${version}`;
        try {
          const pin = JSON.parse(readFileSync(pinPath, "utf8"));
          if (pin.component !== comp || pin.version !== version) {
            results.push(["FAIL", label, "component file identity differs from the requested pin"]);
          } else if (unresolvedPaths(pin).length) {
            results.push(["SKIP", label, "component file exists but release evidence is unresolved"]);
          } else {
            results.push(["PASS", label, "component pin file exists and identity matches"]);
          }
        } catch (exc) {
          results.push(["FAIL", label, `component file unreadable at components/${comp}/${version}.json: ${exc}`]);
        }
      }
    }
  }

  const width = Math.max(...results.map(([, label]) => label.length));
  const counts: Record<string, number> = {};
  for (const [status, label, note] of results) {
    counts[status] = (counts[status] ?? 0) + 1;
    console.log(`${status.padEnd(5)} ${label.padEnd(width)}  ${note}`);
  }
  console.log("\n" + Object.entries(counts).sort().map(([k, v]) => `${k}=${v}`).join(", "));
  if (unresolvedRecords) console.log(`CUT BLOCKED: ${unresolvedRecords} unresolved records; SKIP is not release approval.`);
  return counts.FAIL || unresolvedRecords ? 1 : 0;
}

main().then((code) => process.exit(code));
