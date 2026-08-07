import { describe, expect, test } from "bun:test";

import {
  resolveManifest,
  type Catalog,
  type ConfigurationResult,
  type MaybePromise,
  type ResolvedConfiguration,
} from "../../src/config/index.js";
import {
  admitCatalog,
  createCatalog,
  createManifest,
  fixtureContentDigest,
  generator,
} from "./fixtures/configuration.js";

const synchronous = <T>(value: MaybePromise<T>): T => {
  if (typeof value === "object" && value !== null && "then" in value) {
    throw new Error("Expected synchronous MaybePromise branch");
  }
  return value as T;
};

const reseal = (catalog: Catalog): Catalog => {
  const snapshot: Omit<Catalog, "snapshotDigest"> = {
    identity: catalog.identity,
    sequence: catalog.sequence,
    authority: catalog.authority,
    entries: catalog.entries,
  };
  return { ...snapshot, snapshotDigest: fixtureContentDigest(snapshot) };
};

const resolve = (
  catalog: Catalog,
  admission = admitCatalog(catalog),
): ConfigurationResult<ResolvedConfiguration> =>
  synchronous(
    resolveManifest(createManifest(), catalog, {
      generator,
      catalogAdmission: admission,
    }),
  );

describe("catalogue admission and replay policy", () => {
  test("accepts an externally approved signed snapshot", () => {
    expect(resolve(createCatalog()).ok).toBe(true);
  });

  test("rejects a self-authored replacement despite its internally consistent digest", () => {
    const approved = createCatalog();
    const replacement = reseal({
      ...approved,
      authority: {
        provenance: "attacker://catalogue",
        signature: "attacker:self-signed",
      },
    });
    const result = resolve(replacement, admitCatalog(approved));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toContainEqual({
        code: "unverified-integrity",
        reasonCode: "catalog-snapshot-not-approved",
        path: "/catalogAdmission/snapshotDigest",
      });
    }
  });

  test("rejects a replay below the externally approved minimum sequence", () => {
    const current = createCatalog();
    const replay = reseal({ ...current, sequence: current.sequence - 1 });
    const result = resolve(replay, admitCatalog(replay, current.sequence));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toContainEqual({
        code: "unverified-integrity",
        reasonCode: "catalog-replay-policy-violated",
        path: "/catalog/sequence",
      });
    }
  });
});
