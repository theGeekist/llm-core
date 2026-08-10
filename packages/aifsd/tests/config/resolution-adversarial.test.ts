import { describe, expect, test } from "bun:test";
import { digest } from "@geekist/llm-core/contracts";

import {
  resolveManifest,
  type Catalog,
  type CatalogEntry,
  type ConfigurationResult,
  type GeneratorIdentity,
  type MaybePromise,
  type ResolvedConfiguration,
  type SelectionResolver,
} from "../../src/config/index.js";
import {
  admitCatalog,
  createCatalog,
  createManifest,
  fixtureContentDigest,
  generator,
  withCatalogEntries,
} from "./fixtures/configuration.js";

const synchronous = <T>(value: MaybePromise<T>): T => {
  if (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value
  ) {
    throw new Error("Expected synchronous MaybePromise branch");
  }
  return value as T;
};

const resolveSafely = (
  catalog: Catalog,
  dependencies: { generator: GeneratorIdentity; resolver?: SelectionResolver } = { generator },
) => {
  let result: ConfigurationResult<ResolvedConfiguration> | undefined;
  expect(() => {
    result = synchronous(
      resolveManifest(createManifest(), catalog, {
        ...dependencies,
        catalogAdmission: admitCatalog(catalog),
      }),
    );
  }).not.toThrow();
  return result;
};

const unwrap = (result: ConfigurationResult<ResolvedConfiguration> | undefined) => {
  expect(result?.ok).toBe(true);
  if (!result?.ok) {
    throw new Error("Expected resolved configuration");
  }
  return result.value;
};

const expectRejected = (result: ConfigurationResult<ResolvedConfiguration> | undefined) =>
  expect(result?.ok).toBe(false);

describe("adversarial resolver and catalogue boundaries", () => {
  test("rejects internally consistent custom metadata absent from the catalogue snapshot", () => {
    const catalog = createCatalog();
    const baseline = unwrap(resolveSafely(catalog));
    const forgedDigest = digest("7".repeat(64));
    const forgedClosure = {
      root: { id: "native-logger", version: "1.0.0", digest: forgedDigest },
      representation: { kind: "package-lock" as const, lockDigest: digest("8".repeat(64)) },
    };
    const forged = {
      ...baseline.selections[1]!,
      artifactDigest: forgedDigest,
      closure: forgedClosure,
      closureDigest: fixtureContentDigest(forgedClosure),
      signature: "forged-but-self-consistent",
    };
    const resolver: SelectionResolver = {
      resolve: ({ selection }) =>
        selection.kind === "integration" ? forged : baseline.selections[0]!,
    };

    expectRejected(resolveSafely(catalog, { generator, resolver }));
  });

  test("rejects malformed digest records even when catalogue identity is recomputed", () => {
    const catalog = createCatalog();
    const malformed = { algorithm: "md5", value: "short" };
    const entry = catalog.entries[0]!;
    const invalidEntry = {
      ...entry,
      artifactDigest: malformed,
      closure: { ...entry.closure, root: { ...entry.closure.root, digest: malformed } },
    } as unknown as CatalogEntry;

    expectRejected(resolveSafely(withCatalogEntries(catalog, [invalidEntry, catalog.entries[1]!])));
  });

  test("rejects a malformed catalogue snapshot digest", () => {
    const catalog = createCatalog();
    expectRejected(
      resolveSafely({
        ...catalog,
        snapshotDigest: { algorithm: "sha-256", value: "not-a-digest" },
      } as Catalog),
    );
  });

  test.each(["catalogue", "entry"])("rejects an invalid %s trust level", (subject) => {
    const catalog = createCatalog();
    if (subject === "entry") {
      const entries = [
        { ...catalog.entries[0]!, trust: "ambient-authority" },
        catalog.entries[1]!,
      ] as unknown as Catalog["entries"];
      expectRejected(resolveSafely(withCatalogEntries(catalog, entries)));
      return;
    }

    const authority = { ...catalog.authority, trust: "ambient-authority" };
    const invalidCatalog = {
      ...catalog,
      authority,
      snapshotDigest: fixtureContentDigest({
        identity: catalog.identity,
        authority,
        entries: catalog.entries,
      }),
    } as unknown as Catalog;
    expectRejected(resolveSafely(invalidCatalog));
  });

  test.each([
    { provenance: null, signature: "fixture:signature" },
    { provenance: "fixture://catalogue", signature: 42 },
    { provenance: "fixture://catalogue", signature: "fixture:signature", ambientGrant: true },
  ])("rejects malformed or open catalogue authority %#", (authority) => {
    const catalog = createCatalog();
    const invalidCatalog = {
      ...catalog,
      authority,
      snapshotDigest: fixtureContentDigest({
        identity: catalog.identity,
        authority,
        entries: catalog.entries,
      }),
    } as unknown as Catalog;

    expectRejected(resolveSafely(invalidCatalog));
  });

  test.each([{ kind: "unknown" }, { kind: "members" }])(
    "rejects an invalid executable closure representation %#",
    (representation) => {
      const catalog = createCatalog();
      const entry = catalog.entries[0]!;
      const invalidEntry = {
        ...entry,
        closure: { ...entry.closure, representation },
      } as unknown as CatalogEntry;

      expectRejected(
        resolveSafely(withCatalogEntries(catalog, [invalidEntry, catalog.entries[1]!])),
      );
    },
  );

  test.each([null, { unexpected: "record" }])(
    "rejects a non-array qualification evidence collection %#",
    (evidence) => {
      const catalog = createCatalog();
      const invalidEntry = {
        ...catalog.entries[0]!,
        evidence,
      } as unknown as CatalogEntry;

      expectRejected(
        resolveSafely(withCatalogEntries(catalog, [invalidEntry, catalog.entries[1]!])),
      );
    },
  );

  test("rejects malformed qualification evidence bound to the current closure", () => {
    const catalog = createCatalog();
    const baseline = unwrap(resolveSafely(catalog));
    const entry = catalog.entries[0]!;
    const invalidEntry = {
      ...entry,
      evidence: [
        {
          evidence: { kind: "evaluation", injected: "open-record" },
          subjectClosureDigest: baseline.selections[0]!.closureDigest,
        },
      ],
    } as unknown as CatalogEntry;

    expectRejected(resolveSafely(withCatalogEntries(catalog, [invalidEntry, catalog.entries[1]!])));
  });

  test("rejects a hostile generator without invoking its accessor", () => {
    let reads = 0;
    const hostile = Object.defineProperty(
      { id: generator.id, version: generator.version },
      "artifactDigest",
      {
        enumerable: true,
        get: () => {
          reads += 1;
          return generator.artifactDigest;
        },
      },
    ) as GeneratorIdentity;

    expectRejected(resolveSafely(createCatalog(), { generator: hostile }));
    expect(reads).toBe(0);
  });

  test("snapshots generator identity without freezing caller-owned input", () => {
    const mutable = {
      id: generator.id,
      version: generator.version,
      artifactDigest: { ...generator.artifactDigest },
    };
    const resolved = unwrap(resolveSafely(createCatalog(), { generator: mutable }));

    expect(() => {
      mutable.id = "mutated-generator";
      mutable.artifactDigest.value = "9".repeat(64);
    }).not.toThrow();
    expect(resolved.generator.id).toBe(generator.id);
    expect(resolved.generator.artifactDigest).toEqual(generator.artifactDigest);
    expect(Object.isFrozen(resolved.generator)).toBe(true);
  });
});
