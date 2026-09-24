import { readFileSync } from "node:fs";
import { join } from "node:path";
import sha3 from "js-sha3";

export type IndexingResult = ["PASS" | "FAIL" | "INFO", string, string];
type ObjectValue = Record<string, unknown>;
type Input = { type: string; indexed: boolean; components: Input[] };
type Event = { name: string; anonymous: boolean; inputs: Input[] };

export const ADDITIONAL_INDEXED_CONTRACTS = [
  { type: "MARKET_REGISTRY", component: "market-registry", contract: "MarketRegistry" },
  { type: "ROLLOVER_FACTORY", component: "rollover", contract: "CorkRolloverContractFactory" },
  { type: "ROLLOVER_EXACT_SETTLER", component: "rollover", contract: "ExactSettler" },
  { type: "ROLLOVER_PARTIAL_SETTLER", component: "rollover", contract: "PartialSettler" },
];

function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected object");
  return value as ObjectValue;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("expected array");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("expected nonempty string");
  return value;
}
function input(value: unknown): Input {
  const p = object(value);
  const type = text(p.type);
  if (p.indexed !== undefined && typeof p.indexed !== "boolean") throw new Error("invalid indexed flag");
  return { type, indexed: p.indexed === true, components: type.startsWith("tuple") ? array(p.components).map(input) : [] };
}
function event(value: unknown): Event {
  const e = object(value);
  if (e.type !== "event" || typeof e.anonymous !== "boolean") throw new Error("invalid event ABI");
  const inputs = array(e.inputs);
  if (inputs.some(p => typeof object(p).indexed !== "boolean")) throw new Error("missing event indexed layout");
  return { name: text(e.name), anonymous: e.anonymous, inputs: inputs.map(input) };
}
function canonicalType(p: Input): string {
  return p.type.startsWith("tuple") ? `(${p.components.map(canonicalType).join(",")})${p.type.slice(5)}` : p.type;
}
function signature(e: Event): string {
  return `${e.name}(${e.inputs.map(canonicalType).join(",")})`;
}

/** Additional types have source-bound event layouts, not just topic hashes.
 * The API pin describes metadata, not a worker pin. Declaration checks run
 * independently; live layout verification requires evidence for the reported build.
 */
export function verifyAdditionalIndexing(
  root: string, statusValue: unknown, manifestValues: unknown[], chainIds: string[], distributionValues: unknown[],
): IndexingResult[] {
  const results: IndexingResult[] = [];
  try {
    const status = object(statusValue);
    const watching = array(status.watching).map(object);
    const manifests = manifestValues.map(object).filter(d => !d.supersededBy && d.contracts);
    const evidence = object(JSON.parse(readFileSync(join(root, "scripts/indexing-evidence.json"), "utf8")));
    const worker = object(evidence.workerSource);
    const types = object(evidence.types);
    const decoder = status.decoders ? object(status.decoders) : null;
    const declared = decoder ? array(decoder.contract_types).map(object) : [];
    const commit = decoder?.worker_commit;
    const supportedCommit = typeof commit === "string" && /^[0-9a-f]{7,40}$/.test(commit) && text(worker.commit).startsWith(commit);
    // Generated tokens/clones and external oracle chains are not pinned-address
    // requirements. The six Phoenix types retain their historical-generation checks.
    const excluded: Record<string, true> = { CHAINLINK_ORACLE: true, CORK_CPT: true, CORK_CST: true, ROLLOVER_CONTRACT: true };
    const phoenix: Record<string, true> = { CORK_ADAPTER: true, CORK_CONSTRAINT_RATE_ADAPTER: true, CORK_CONTROLLER: true, CORK_POOL_MANAGER: true, CORK_SHARES_FACTORY: true, CORK_WHITELIST_MANAGER: true };
    const known = new Set([...ADDITIONAL_INDEXED_CONTRACTS.map(m => m.type), "LOP", ...Object.keys(excluded), ...Object.keys(phoenix)]);
    for (const ct of declared) {
      const type = text(ct.contract_type);
      if (!known.has(type)) results.push(["FAIL", `indexing/mapping ${type}`, "declared decoder type has no verifier mapping or explicit exclusion"]);
    }

    const coverage = (type: string, label: string, chain: string, address: string) => {
      const entries = watching.filter(w => String(w.chain_id) === chain && text(w.address).toLowerCase() === address.toLowerCase());
      if (!entries.length) results.push(["FAIL", label, `${type}: required deployment missing from watch-list (${address})`]);
      else if (!entries.some(w => w.contract_type === type)) results.push(["FAIL", label, `${type}: address registered as ${entries.map(w => w.contract_type).join(", ")}`]);
      else results.push(["PASS", label, `${type}: chain/address/type registration verified (${address})`]);
    };

    const decode = (type: string, label: string, abi: Event[], shared: Event[] = []) => {
      const ct = declared.find(d => d.contract_type === type);
      if (!ct || !types[type]) {
        results.push(["FAIL", label, `${type}: missing required decoder evidence (declaration or event source)`]);
        return;
      }
      const expected = array(object(types[type]).events).map(event);
      const published = array(ct.events).map(object);
      const failures: string[] = [];
      for (const e of expected) {
        const sig = signature(e);
        const topic = "0x" + sha3.keccak_256(sig);
        if (!published.some(p => p.name === e.name && p.signature === sig && p.topic0 === topic)) failures.push(`missing required event ${e.name} (${sig})`);
      }
      for (const p of published) {
        if (!expected.some(e => p.signature === signature(e) && p.topic0 === "0x" + sha3.keccak_256(signature(e)) && p.name === e.name)) failures.push(`unreviewed decoder event ${String(p.name)}`);
      }
      if (failures.length) {
        results.push(["FAIL", label, failures.join("; ")]);
        return;
      }
      results.push(["PASS", label.replace("indexing/decode", "indexing/events"), `${expected.length} required event names/signatures/topics match the live declaration`]);
      if (!supportedCommit) {
        results.push(["FAIL", label, `live layout evidence unavailable: reviewed source ${text(worker.commit)}, reported worker ${String(commit)}; declared events match, but the API does not publish indexed layouts; re-review worker source (compatibility unknown)`]);
        return;
      }
      for (const e of expected) {
        const sig = signature(e);
        // Both settlers share one handler table. These three Partial-only
        // handlers cannot receive Exact logs; validate them against Partial,
        // never against arbitrary contracts in the component.
        const partialOnly = type === "ROLLOVER_EXACT_SETTLER" && ["OrderClosing", "FillerSettled", "DefaulterResidualReclaimedWithSubFiller"].includes(e.name);
        const source = partialOnly ? shared : abi;
        const candidates = source.filter(a => signature(a) === sig);
        if (!candidates.length) failures.push(`${e.name}: missing required ABI event${partialOnly ? " in shared PartialSettler" : ""}`);
        else if (!candidates.some(a => JSON.stringify(a) === JSON.stringify(e))) failures.push(`${e.name}: incompatible indexed/anonymous/tuple layout`);
      }
      results.push(failures.length ? ["FAIL", label, failures.join("; ")] : ["PASS", label, `${expected.length} required events: signatures and indexed/anonymous/tuple layouts compatible with worker ${String(commit)}${type === "ROLLOVER_EXACT_SETTLER" ? "; three Partial-only shared handlers checked against PartialSettler" : ""}`]);
    };

    for (const mapping of ADDITIONAL_INDEXED_CONTRACTS) {
      for (const doc of manifests.filter(d => d.component === mapping.component)) {
        const contracts = object(doc.contracts);
        if (!contracts[mapping.contract]) continue;
        const entry = object(contracts[mapping.contract]);
        const deployments = object(entry.deployments);
        for (const chain of chainIds) {
          const rows = deployments[chain];
          if (rows === null || rows === undefined || array(rows).length === 0) continue;
          const label = `indexing/${mapping.component}/${mapping.contract}@${text(doc.version)} @ ${chain}`;
          for (const value of array(rows)) coverage(mapping.type, label, chain, text(object(value).address));
          const decodeLabel = `indexing/decode ${mapping.type} vs ${mapping.component}@${text(doc.version)} @ ${chain}`;
          try {
            const loadEvents = (contract: string) => {
              const ref = text(object(contracts[contract]).abi);
              const parsed: unknown = JSON.parse(readFileSync(join(root, "components", mapping.component, ref), "utf8"));
              return array(Array.isArray(parsed) ? parsed : object(parsed).abi).filter(e => object(e).type === "event").map(event);
            };
            decode(mapping.type, decodeLabel, loadEvents(mapping.contract), mapping.type === "ROLLOVER_EXACT_SETTLER" ? loadEvents("PartialSettler") : []);
          } catch (error) { results.push(["FAIL", decodeLabel, `required ABI/decoder evidence unavailable: ${error}`]); }
        }
      }
    }

    const external = object(evidence.external);
    for (const dist of distributionValues.map(object).filter(d => !d.supersededBy)) {
      const dependencies = dist.externalDependencies ? object(dist.externalDependencies) : {};
      if (!dependencies[text(external.dependency)]) continue;
      const addresses = object(dependencies[text(external.dependency)]);
      const chains = array(dist.chains).map(String).filter(c => chainIds.includes(c));
      for (const chain of chains) {
        const label = `indexing/external/LOP ${text(dist.distribution)} @ ${chain}`;
        const address = text(addresses[chain]);
        coverage("LOP", label, chain, address);
        const decodeLabel = `indexing/decode LOP ${text(dist.distribution)} @ ${chain}`;
        if (address.toLowerCase() !== text(external.address).toLowerCase() || !object(external.deployments)[chain]) {
          results.push(["FAIL", decodeLabel, "required external ABI evidence missing for this chain/address"]);
        } else decode("LOP", decodeLabel, array(external.events).map(event));
      }
    }
  } catch (error) {
    results.push(["FAIL", "indexing/evidence", `invalid or missing required indexing evidence: ${error}`]);
  }
  return results;
}
