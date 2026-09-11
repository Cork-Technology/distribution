/**
 * Decode safety across ABI generations.
 *
 * One indexer decoder type serves every live deployment of a component. While
 * two Distributions are live, the indexer consumes the topics of both ABI
 * generations, so no single pin can carry every topic the decoder declares.
 * The check must resolve consumed topics across the union of the component's
 * non-superseded pins, and still FAIL on a topic that no live pin emits.
 *
 * Each case runs the real verifier in a temporary repository with an
 * offline fetch: the indexing status endpoint serves a fixture, service
 * probes answer minimally, and no RPC or GitHub call leaves the process.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sha3 from "js-sha3";

const { keccak_256 } = sha3;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const BASE = "http://indexer.fixture";

const event = (name: string, types: string[]) => ({
  type: "event",
  name,
  inputs: types.map((t, i) => ({ name: `p${i}`, type: t, indexed: false })),
});
const topic0 = (ev: { name: string; inputs: { type: string }[] }) =>
  "0x" + keccak_256(`${ev.name}(${ev.inputs.map((i) => i.type).join(",")})`);

// Two generations of the same event, plus one the indexer never saw.
const marketCreatedV1 = event("MarketCreated", ["bytes32", "address", "address", "uint256", "address", "address", "address"]);
const marketCreatedV2 = event("MarketCreated", ["bytes32", "address", "address", "uint256", "address", "address", "address", "uint256", "uint256"]);
const upgraded = event("Upgraded", ["address"]);
const orphan = event("NeverEmitted", ["uint256"]);

type Pin = { version: string; events: object[]; supersededBy?: string | null; todoAbi?: boolean };

function phoenixPin(pin: Pin) {
  return {
    manifest: {
      schemaVersion: 1,
      component: "phoenix",
      version: pin.version,
      supersededBy: pin.supersededBy ?? null,
      contracts: {
        CorkPoolManagerProxy: { version: pin.version, abi: pin.todoAbi ? "TODO" : `./abi/CorkPoolManagerProxy-${pin.version}.json`, deployments: { "8453": null } },
        CorkPoolManagerImplementation: { version: pin.version, abi: pin.todoAbi ? "TODO" : `./abi/CorkPoolManagerImplementation-${pin.version}.json`, deployments: { "8453": null } },
        WhitelistManagerProxy: { version: pin.version, abi: `./abi/WhitelistManagerProxy-${pin.version}.json`, deployments: { "8453": null } },
      },
    },
    abis: {
      [`CorkPoolManagerProxy-${pin.version}.json`]: [],
      [`CorkPoolManagerImplementation-${pin.version}.json`]: pin.events,
      [`WhitelistManagerProxy-${pin.version}.json`]: [upgraded],
    },
  };
}

const apiPin = {
  schemaVersion: 1,
  component: "cork-api",
  version: "1.0.0",
  supersededBy: null,
  services: { baseUrl: BASE, indexingStatus: "/indexing/v1/status", chains: [8453] },
};

function verify(pins: Pin[], consumed: object[]) {
  const dir = mkdtempSync(join(tmpdir(), "distribution-decode-"));
  try {
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, "components", "phoenix", "abi"), { recursive: true });
    mkdirSync(join(dir, "components", "cork-api"), { recursive: true });
    mkdirSync(join(dir, "distributions", "phoenix"), { recursive: true });
    cpSync(join(root, "scripts", "verify.ts"), join(dir, "scripts", "verify.ts"));
    symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "dir");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
    for (const pin of pins) {
      const { manifest, abis } = phoenixPin(pin);
      writeFileSync(join(dir, "components", "phoenix", `${pin.version}.json`), JSON.stringify(manifest));
      for (const [file, abi] of Object.entries(abis))
        writeFileSync(join(dir, "components", "phoenix", "abi", file), JSON.stringify(abi));
    }
    writeFileSync(join(dir, "components", "cork-api", "1.0.0.json"), JSON.stringify(apiPin));
    writeFileSync(
      join(dir, "distributions", "phoenix", "v1.json"),
      JSON.stringify({ distribution: "phoenix/v1", components: { phoenix: pins[0].version, "cork-api": "1.0.0" } }),
    );
    const status = {
      chains: [],
      watching: [],
      decoders: {
        contract_types: [
          { contract_type: "CORK_POOL_MANAGER", events: consumed.map((ev: any) => ({ name: ev.name, topic0: topic0(ev) })) },
        ],
      },
    };
    writeFileSync(join(dir, "status.json"), JSON.stringify(status));
    writeFileSync(
      join(dir, "offline-fixture.mjs"),
      `import { readFileSync } from "node:fs";
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith("/indexing/v1/status")) return new Response(readFileSync("status.json"));
  if (u.endsWith("/v1/meta")) return new Response(JSON.stringify({ component: "cork-api", version: "1.0.0" }));
  return new Response(JSON.stringify({}));
};`,
    );
    const result = spawnSync(process.execPath, ["--import", "tsx", "--import", "./offline-fixture.mjs", "scripts/verify.ts"], {
      cwd: dir,
      encoding: "utf8",
      timeout: 20000,
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("two live generations: topics consumed from either pin resolve, the cut passes", () => {
  const result = verify(
    [{ version: "1.3.0", events: [marketCreatedV1] }, { version: "1.4.0", events: [marketCreatedV2] }],
    [marketCreatedV1, marketCreatedV2, upgraded],
  );
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /PASS\s+indexing\/decode CORK_POOL_MANAGER vs phoenix@\{1\.3\.0\+1\.4\.0\}/);
  assert.doesNotMatch(result.output, /FAIL\s+indexing\/decode/);
});

test("a consumed topic that no live pin emits still fails the cut", () => {
  const result = verify(
    [{ version: "1.3.0", events: [marketCreatedV1] }, { version: "1.4.0", events: [marketCreatedV2] }],
    [marketCreatedV1, marketCreatedV2, orphan],
  );
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL\s+indexing\/decode CORK_POOL_MANAGER vs phoenix@\{1\.3\.0\+1\.4\.0\}.*NeverEmitted/);
  assert.doesNotMatch(result.output, /absent from every live pinned ABI:.*MarketCreated/);
});

test("a superseded pin lends no topics: its generation must have left the indexer", () => {
  const result = verify(
    [{ version: "1.4.0", events: [marketCreatedV2] }, { version: "1.3.0", events: [marketCreatedV1], supersededBy: "1.4.0" }],
    [marketCreatedV1, marketCreatedV2],
  );
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL\s+indexing\/decode CORK_POOL_MANAGER vs phoenix@\{1\.4\.0\}.*MarketCreated/);
});

test("the shared lifecycle event resolves component-wide and names its lender", () => {
  const result = verify([{ version: "1.4.0", events: [marketCreatedV2] }], [marketCreatedV2, upgraded]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /resolved component-wide: Upgraded from 1\.4\.0\/WhitelistManagerProxy\.Upgraded/);
});

test("a placeholder ABI never contributes to a PASS: the row is SKIP", () => {
  const result = verify([{ version: "1.4.0", events: [], todoAbi: true }], [upgraded]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /SKIP\s+indexing\/decode CORK_POOL_MANAGER vs phoenix@\{1\.4\.0\}.*no resolved ABI/);
  assert.doesNotMatch(result.output, /PASS\s+indexing\/decode/);
});
