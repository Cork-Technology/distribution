import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sha3 from "js-sha3";

type AbiInput = { type: string; indexed?: boolean; components?: AbiInput[] };
type AbiEvent = { type: string; name: string; anonymous: boolean; inputs: AbiInput[] };
type Deployment = { address: string; codeHash: string; implementation: string | null };
type Component = { component: string; version: string; contracts: Record<string, { abi: string; deployments: Record<string, Deployment[] | null> }> };
type Evidence = { apiSource: object; workerSource: { commit: string }; types: Record<string, { events: AbiEvent[] }> };
type Watch = { chain_id: number; address: string; contract_type: string; contracts_version: string | null; last_block_confirmed: number };
type Status = { watching: Watch[]; chains: unknown[]; decoders: { worker_commit: string; contract_types: { contract_type: string; events: { name: string; signature: string; topic0: string }[] }[] } | null };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Checked-in, provenance-labelled test fixtures, not network input.
const json = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), "utf8"));
const flat = (p: AbiInput): string => p.type.startsWith("tuple") ? `(${p.components!.map(flat).join(",")})${p.type.slice(5)}` : p.type;
const signature = (e: AbiEvent) => `${e.name}(${e.inputs.map(flat).join(",")})`;
const mappings = [
  ["MARKET_REGISTRY", "market-registry", "0.5.0", "MarketRegistry"],
  ["ROLLOVER_FACTORY", "rollover", "0.2.0", "CorkRolloverContractFactory"],
  ["ROLLOVER_EXACT_SETTLER", "rollover", "0.2.0", "ExactSettler"],
  ["ROLLOVER_PARTIAL_SETTLER", "rollover", "0.2.0", "PartialSettler"],
];

// Real component ABIs and addresses, plus worker event layouts with immutable
// provenance in indexing-evidence.json. Only runtime RPC responses are synthetic;
// no networking is permitted. The status shape is the pinned API's get-status schema.
function verify(change: (status: Status, dir: string) => void = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), "distribution-indexing-"));
  try {
    cpSync(join(root, "scripts"), join(dir, "scripts"), { recursive: true });
    symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "dir");
    writeFileSync(join(dir, "package.json"), '{"type":"module"}');
    const evidence = json<Evidence>("scripts/indexing-evidence.json");
    const watching: Watch[] = [];
    for (const [type, component, version, contract] of mappings) {
      const source = json<Component>(`components/${component}/${version}.json`);
      const folder = join(dir, "components", component);
      mkdirSync(join(folder, "abi"), { recursive: true });
      const file = join(folder, `${version}.json`);
      let doc: Component;
      try { doc = JSON.parse(readFileSync(file, "utf8")); } catch { doc = { component, version, contracts: {} }; }
      doc.contracts[contract] = structuredClone(source.contracts[contract]);
      for (const [chain, rows] of Object.entries(doc.contracts[contract].deployments)) {
        for (const row of rows ?? []) {
          row.codeHash = "0x" + sha3.keccak_256(Buffer.from("00", "hex"));
          row.implementation = null;
          watching.push({ chain_id: Number(chain), address: row.address, contract_type: type, contracts_version: `${component}@${version}`, last_block_confirmed: 100 });
        }
      }
      cpSync(join(root, "components", component, source.contracts[contract].abi), join(folder, source.contracts[contract].abi));
      writeFileSync(file, JSON.stringify(doc));
    }
    const dist = json<{ externalDependencies: Record<string, Record<string, string>> }>("distributions/phoenix/v0.4-rc.1.json");
    for (const [chain, address] of Object.entries(dist.externalDependencies["1inch-limit-order-protocol"]))
      watching.push({ chain_id: Number(chain), address, contract_type: "LOP", last_block_confirmed: 100, contracts_version: null });
    mkdirSync(join(dir, "distributions", "phoenix"), { recursive: true });
    writeFileSync(join(dir, "distributions", "phoenix", "v1.json"), JSON.stringify({ distribution: "fixture", chains: [8453, 42161], components: {}, externalDependencies: dist.externalDependencies }));
    mkdirSync(join(dir, "components", "cork-api"), { recursive: true });
    writeFileSync(join(dir, "components", "cork-api", "0.4.3.json"), JSON.stringify({ component: "cork-api", version: "0.4.3", source: evidence.apiSource, services: { baseUrl: "https://fixture.invalid", indexingStatus: "/indexing/v1/status", chains: [8453, 42161] } }));
    const status: Status = { watching, chains: [], decoders: { worker_commit: evidence.workerSource.commit, contract_types: Object.entries(evidence.types).map(([type, spec]) => ({ contract_type: type, events: spec.events.map(ev => ({ name: ev.name, signature: signature(ev), topic0: "0x" + sha3.keccak_256(signature(ev)) })) })) } };
    change(status, dir);
    writeFileSync(join(dir, "status.json"), JSON.stringify(status));
    writeFileSync(join(dir, "offline.mjs"), `import { readFileSync } from "node:fs";
globalThis.fetch = async (url, options) => {
 if (String(url).endsWith('/indexing/v1/status')) return new Response(readFileSync('status.json'));
 if (String(url).endsWith('/v1/meta')) return Response.json({component:'cork-api',version:'0.4.3'});
 if (options?.method === 'POST') return Response.json({result:'0x00'});
 throw new Error('Unexpected network request: '+url);
};`);
    const result = spawnSync(process.execPath, ["--import", "tsx", "--import", "./offline.mjs", "scripts/verify.ts"], { cwd: dir, encoding: "utf8", timeout: 20000 });
    assert.ifError(result.error);
    return { code: result.status, output: result.stdout + result.stderr };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

for (const type of [...mappings.map(m => m[0]), "LOP"]) {
  test(`${type}: required watch registration cannot disappear on either chain`, () => {
    for (const chain of [8453, 42161]) {
      const r = verify(s => { s.watching = s.watching.filter(w => w.contract_type !== type || w.chain_id !== chain); });
      assert.equal(r.code, 1, r.output);
      assert.match(r.output, new RegExp(`FAIL.*${chain}.*${type}.*watch-list`));
    }
  });
  test(`${type}: correct address registered under wrong type fails`, () => {
    const r = verify(s => { s.watching.find(w => w.contract_type === type)!.contract_type = "WRONG"; });
    assert.equal(r.code, 1, r.output);
    assert.match(r.output, new RegExp(`FAIL.*${type}.*registered.*WRONG`));
  });
  test(`${type}: missing required decoder event fails`, () => {
    const r = verify(s => { s.decoders!.contract_types.find(t => t.contract_type === type)!.events.pop(); });
    assert.equal(r.code, 1, r.output);
    assert.match(r.output, new RegExp(`FAIL.*decode ${type}.*missing required event`));
  });
}

test("supported Registry, shared settlers, factory and external LOP pass on both chains", () => {
  const r = verify();
  assert.equal(r.code, 0, r.output);
  for (const type of [...mappings.map(m => m[0]), "LOP"]) {
    for (const chain of [8453, 42161]) assert.match(r.output, new RegExp(`PASS.*decode ${type}.*${chain}`));
  }
});

test("same topic with changed indexed layout is incompatible", () => {
  const r = verify((_s, dir) => {
    const file = join(dir, "components/rollover/abi/ExactSettler-0.2.0.json");
    const abi: AbiEvent[] = JSON.parse(readFileSync(file, "utf8"));
    abi.find(e => e.name === "Open" && e.type === "event")!.inputs[0].indexed = false;
    writeFileSync(file, JSON.stringify(abi));
  });
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /FAIL.*decode ROLLOVER_EXACT_SETTLER.*Open.*layout/);
});

test("missing decoder snapshot cannot earn decoding PASS", () => {
  const r = verify(s => { s.decoders = null; });
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /FAIL.*decode.*evidence/);
  assert.doesNotMatch(r.output, /PASS.*decode/);
});

test("unreviewed worker preserves event checks but cannot assert live layouts", () => {
  const r = verify(s => { s.decoders!.worker_commit = "deadbeef"; });
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /PASS.*events LOP/);
  assert.match(r.output, /FAIL.*decode LOP.*layout evidence unavailable/);
  assert.doesNotMatch(r.output, /PASS.*decode|incompatible/);
});

test("worker drift does not hide a missing required event", () => {
  const r = verify(s => {
    s.decoders!.worker_commit = "deadbeef";
    s.decoders!.contract_types.find(t => t.contract_type === "LOP")!.events.pop();
  });
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /FAIL.*decode LOP.*missing required event/);
});

test("unknown type at a required address fails rather than becoming out of scope", () => {
  const r = verify(s => { s.decoders!.contract_types = s.decoders!.contract_types.filter(t => t.contract_type !== "MARKET_REGISTRY"); });
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /FAIL.*decode MARKET_REGISTRY.*evidence/);
});

test("LOP cancellation cannot borrow the indexed settler layout with the same topic0", () => {
  const r = verify((_s, dir) => {
    const file = join(dir, "scripts/indexing-evidence.json");
    const evidence: Evidence & { external: { events: AbiEvent[] } } = JSON.parse(readFileSync(file, "utf8"));
    evidence.external.events.find(e => e.name === "OrderCancelled")!.inputs[0].indexed = true;
    writeFileSync(file, JSON.stringify(evidence));
  });
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /FAIL.*decode LOP.*OrderCancelled.*layout/);
});

test("unknown declared decoder types require an explicit mapping or exclusion", () => {
  const r = verify(s => { s.decoders!.contract_types.push({ contract_type: "NEW_REQUIRED_TYPE", events: [] }); });
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /FAIL.*mapping NEW_REQUIRED_TYPE.*no verifier mapping/);
});

test("declared events without reviewed layout evidence fail closed", () => {
  const r = verify((_s, dir) => {
    const file = join(dir, "scripts/indexing-evidence.json");
    const evidence: Evidence = JSON.parse(readFileSync(file, "utf8"));
    delete evidence.types.LOP;
    writeFileSync(file, JSON.stringify(evidence));
  });
  assert.equal(r.code, 1, r.output);
  assert.match(r.output, /FAIL.*decode LOP.*missing required decoder evidence/);
});
