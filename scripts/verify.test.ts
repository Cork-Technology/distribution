import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function verify(component: Record<string, unknown>, distribution: Record<string, unknown>, filename = String(component.version)) {
  const dir = mkdtempSync(join(tmpdir(), "distribution-verify-"));
  try {
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, "components", "example"), { recursive: true });
    mkdirSync(join(dir, "distributions", "example"), { recursive: true });
    cpSync(join(root, "scripts", "verify.ts"), join(dir, "scripts", "verify.ts"));
    symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "dir");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(dir, "components", "example", `${filename}.json`), JSON.stringify(component));
    writeFileSync(join(dir, "distributions", "example", "v1.0.json"), JSON.stringify(distribution));
    writeFileSync(join(dir, "rpc-fixture.mjs"), `globalThis.fetch = async () => new Response(JSON.stringify({ result: "0x" }));`);
    const result = spawnSync(process.execPath, ["--import", "tsx", "--import", "./rpc-fixture.mjs", "scripts/verify.ts"], {
      cwd: dir, encoding: "utf8", timeout: 15000,
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function contract(version: string) {
  return { component: "example", version, contracts: { Example: { deployments: { "8453": null } } } };
}
function distribution(version: string) {
  return { distribution: "example/v1.0", components: { example: version } };
}

test("an existing untagged component file is not a verified Distribution pin", () => {
  const version = "0.0.0-untagged.candidate";
  const result = verify(contract(version), distribution(version));
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /SKIP\s+example\/v1\.0 pins example@/);
  assert.doesNotMatch(result.output, /PASS\s+example\/v1\.0 pins example@/);
});

test("nested unresolved provenance blocks a real-looking version", () => {
  const result = verify({ ...contract("1.0.0"), source: { commit: "MOCK(example): public release commit" } }, distribution("1.0.0"));
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /source\.commit/);
  assert.doesNotMatch(result.output, /PASS\s+example\/v1\.0 pins example@/);
});

test("pending integration evidence blocks a Distribution even when all pin files resolve", () => {
  const result = verify(contract("1.0.0"), {
    ...distribution("1.0.0"), integrationSuite: { decision: "TODO: integration evidence" },
  });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /integrationSuite\.decision/);
});

test("a component filename cannot hide a different component version", () => {
  const result = verify(contract("2.0.0"), distribution("1.0.0"), "1.0.0");
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL\s+example\/v1\.0 pins example@1\.0\.0/);
});

test("a historical service skip does not become an unresolved-cut failure", () => {
  const result = verify({ component: "example", version: "1.0.0", contracts: null,
    services: { baseUrl: "https://example.invalid" }, supersededBy: "2.0.0" }, distribution("1.0.0"));
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /PASS\s+example\/v1\.0 pins example@1\.0\.0/);
});

test("pending provenance does not hide a missing deployed runtime", () => {
  const version = "0.0.0-untagged.candidate";
  const result = verify({ component: "example", version, contracts: { Example: { deployments: { "8453": [{
    address: "0x" + "1".repeat(40), codeHash: "0x" + "0".repeat(64), implementation: null,
    deployedCommit: "MOCK(example): public release commit",
  }] } } } }, distribution(version));
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL\s+example\/Example @ 8453/);
});
