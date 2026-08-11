/**
 * Verify every manifest against reality.
 *
 * Each component is verified by what it is:
 *  - contract rows against a fresh on-chain read: code must exist at the
 *    address, keccak256 of the runtime code must equal the row's codeHash,
 *    and a proxy's EIP-1967 implementation slot must resolve to the row's
 *    implementation;
 *  - service components live against GET /v1/meta: the running component
 *    name and version must match the pin;
 *  - pure-artifact components against their public tag: it must resolve to
 *    the pinned commit.
 *
 * Rows containing TODO placeholders report as SKIP, never PASS.
 * deployedCommit is recorded provenance, not on-chain verifiable — it is
 * echoed, not checked. Exit code is non-zero on any FAIL.
 *
 * Usage: npm run verify
 * RPC overrides via env: RPC_42161, RPC_8453 (defaults are public endpoints).
 */
import { readdirSync, readFileSync } from "node:fs";
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

type Result = ["PASS" | "FAIL" | "SKIP" | "NULL", string, string];

const isTodo = (v: unknown): boolean =>
  typeof v === "string" && v.includes("TODO");

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
  if (isTodo(row.address) || isTodo(row.codeHash))
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
  if (impl && !isTodo(impl)) {
    const slot = await rpc(url, "eth_getStorageAt", [row.address, EIP1967_IMPL_SLOT, "latest"]);
    const onchain = "0x" + slot.slice(-40);
    if (onchain.toLowerCase() !== impl.toLowerCase())
      return ["FAIL", label, `EIP-1967 impl mismatch: chain ${onchain}, manifest ${impl}`];
  }
  const commit = String(row.deployedCommit ?? "?").slice(0, 8);
  return ["PASS", label, `code ${code.length / 2 - 1} bytes, commit ${commit}`];
}

async function verifyService(doc: Record<string, any>): Promise<Result | null> {
  const base: string | undefined = doc.services?.baseUrl;
  if (!base || isTodo(base)) return null;
  const label = `${doc.component} @ ${base}`;
  let meta: Record<string, unknown>;
  try {
    const resp = await fetch(`${base}/v1/meta`, { signal: AbortSignal.timeout(15000) });
    meta = (await resp.json()) as Record<string, unknown>;
  } catch (exc) {
    return ["FAIL", label, `/v1/meta unreachable: ${exc}`];
  }
  if (meta.component !== doc.component)
    return ["FAIL", label, `component mismatch: service says ${JSON.stringify(meta.component)}, manifest ${JSON.stringify(doc.component)}`];
  if (meta.version !== doc.version)
    return ["FAIL", label, `version mismatch: service serves ${JSON.stringify(meta.version)}, manifest pins ${JSON.stringify(doc.version)}`];
  return ["PASS", label, `/v1/meta serves ${meta.component} ${meta.version} (commit ${meta.commit ?? "?"})`];
}

async function verifyRelease(doc: Record<string, any>): Promise<Result> {
  const repo: string = doc.source?.repo ?? "";
  const tag: string | undefined = doc.source?.tag;
  const commit: string | undefined = doc.source?.commit;
  const label = `${doc.component} @ ${tag}`;
  if (!repo.startsWith("https://github.com/") || !tag || isTodo(tag))
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

async function main(): Promise<number> {
  const componentsDir = join(ROOT, "components");
  const manifests: string[] = [];
  for (const comp of readdirSync(componentsDir)) {
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
  for (const path of manifests) {
    const doc = JSON.parse(readFileSync(path, "utf8"));
    const serviceResult = await verifyService(doc);
    if (serviceResult) results.push(serviceResult);
    const contracts = doc.contracts;
    if (!contracts || typeof contracts !== "object") {
      if (!serviceResult) results.push(await verifyRelease(doc));
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

  const width = Math.max(...results.map(([, label]) => label.length));
  const counts: Record<string, number> = {};
  for (const [status, label, note] of results) {
    counts[status] = (counts[status] ?? 0) + 1;
    console.log(`${status.padEnd(5)} ${label.padEnd(width)}  ${note}`);
  }
  console.log("\n" + Object.entries(counts).sort().map(([k, v]) => `${k}=${v}`).join(", "));
  return counts.FAIL ? 1 : 0;
}

main().then((code) => process.exit(code));
