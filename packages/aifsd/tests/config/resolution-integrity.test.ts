import { describe, expect, test } from "bun:test";
import { digest } from "@geekist/llm-core/contracts";

import {
  resolveManifest,
  type Catalog,
  type ConfigurationResult,
  type Manifest,
  type MaybePromise,
  type ResolvedConfiguration,
  type SelectionResolver,
} from "../../src/config/index.js";
import {
  admitCatalog,
  createCatalog,
  createManifest,
  generator,
  withCatalogEntries,
} from "./fixtures/configuration.js";

const synchronous = <T>(value: MaybePromise<T>): T => {
  if (typeof value === "object" && value !== null && "then" in value) {
    throw new Error("Expected synchronous MaybePromise branch");
  }
  return value as T;
};

const unwrap = <T>(result: ConfigurationResult<T>): T => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return result.value;
};

const resolve = (
  manifest: Manifest,
  catalog: Catalog,
): ConfigurationResult<ResolvedConfiguration> =>
  synchronous(
    resolveManifest(manifest, catalog, {
      generator,
      catalogAdmission: admitCatalog(catalog),
    }),
  );

describe("configuration resolution integrity", () => {
  test("uses entry trust rather than catalog-wide trust", () => {
    const manifest = createManifest();
    const trustedManifest: Manifest = {
      ...manifest,
      selections: [
        { ...manifest.selections[0]!, trust: { minimum: "official" } },
        manifest.selections[1]!,
      ],
    };
    const catalog = createCatalog();
    expect(catalog.authority.signature).toBe("fixture:catalogue-signature");
    expect(catalog.entries[0]!.trust).toBe("official");

    const signedEntryCatalog = withCatalogEntries(catalog, [
      { ...catalog.entries[0]!, trust: "verified" },
      catalog.entries[1]!,
    ]);
    const result = resolve(trustedManifest, signedEntryCatalog);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some((diagnostic) => diagnostic.code === "unverified-integrity"),
      ).toBe(true);
    }
  });

  test("rejects an artifact digest that disagrees with the closure root", () => {
    const catalog = createCatalog();
    const result = resolve(
      createManifest(),
      withCatalogEntries(catalog, [
        { ...catalog.entries[0]!, artifactDigest: digest("6".repeat(64)) },
        catalog.entries[1]!,
      ]),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some((diagnostic) => diagnostic.code === "unverified-integrity"),
      ).toBe(true);
    }
  });

  test("rejects ambiguous same-version entries with different content", () => {
    const catalog = createCatalog();
    const original = catalog.entries[0]!;
    const conflicting = {
      ...original,
      artifactDigest: digest("7".repeat(64)),
      closure: {
        ...original.closure,
        root: { ...original.closure.root, digest: digest("7".repeat(64)) },
      },
    };
    const result = resolve(
      createManifest(),
      withCatalogEntries(catalog, [
        original,
        conflicting,
        catalog.entries[1]!,
      ] as Catalog["entries"]),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some((diagnostic) => diagnostic.code === "ambiguous-selection"),
      ).toBe(true);
    }
  });

  test("treats closure member order as non-semantic", () => {
    const firstCatalog = createCatalog();
    const entry = firstCatalog.entries[0]!;
    if (entry.closure.representation.kind !== "members") {
      throw new Error("Fixture requires member closure representation");
    }
    const members = [
      ...entry.closure.representation.members,
      { id: "template-parser", version: "1.0.0", digest: digest("8".repeat(64)) },
    ];
    const catalogWithMembers = withCatalogEntries(firstCatalog, [
      { ...entry, closure: { ...entry.closure, representation: { kind: "members", members } } },
      firstCatalog.entries[1]!,
    ] as Catalog["entries"]);
    const catalogWithReversedMembers = withCatalogEntries(catalogWithMembers, [
      {
        ...catalogWithMembers.entries[0]!,
        closure: {
          ...catalogWithMembers.entries[0]!.closure,
          representation: { kind: "members", members: [...members].reverse() },
        },
      },
      catalogWithMembers.entries[1]!,
    ] as Catalog["entries"]);

    const first = unwrap(resolve(createManifest(), catalogWithMembers));
    const reversed = unwrap(resolve(createManifest(), catalogWithReversedMembers));
    expect(reversed.selections[0]!.closureDigest).toEqual(first.selections[0]!.closureDigest);
  });

  test("rejects duplicate dependency-member coordinates with different content", () => {
    const catalog = createCatalog();
    const entry = catalog.entries[0]!;
    if (entry.closure.representation.kind !== "members") {
      throw new Error("Fixture requires member closure representation");
    }
    const originalMember = entry.closure.representation.members[0]!;
    const duplicate = { ...originalMember, digest: digest("b".repeat(64)) };
    const conflictingCatalog = withCatalogEntries(catalog, [
      {
        ...entry,
        closure: {
          ...entry.closure,
          representation: {
            kind: "members",
            members: [...entry.closure.representation.members, duplicate],
          },
        },
      },
      catalog.entries[1]!,
    ]);

    const result = resolve(createManifest(), conflictingCatalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some((diagnostic) => diagnostic.code === "unverified-integrity"),
      ).toBe(true);
    }
  });

  test("rejects hostile custom resolver output without invoking accessors", () => {
    const baseline = unwrap(resolve(createManifest(), createCatalog()));
    let reads = 0;
    const hostile = Object.defineProperty({ ...baseline.selections[0]! }, "closureDigest", {
      enumerable: true,
      get: () => {
        reads += 1;
        return baseline.selections[0]!.closureDigest;
      },
    });
    const resolver: SelectionResolver = {
      resolve: ({ selection }) =>
        selection.kind === "template"
          ? (hostile as (typeof baseline.selections)[0])
          : baseline.selections[1]!,
    };

    const result = synchronous(
      resolveManifest(createManifest(), createCatalog(), {
        generator,
        resolver,
        catalogAdmission: admitCatalog(createCatalog()),
      }),
    );
    expect(result.ok).toBe(false);
    expect(reads).toBe(0);
  });

  test("rejects a custom resolver substitution outside the requested selection", () => {
    const manifest = createManifest();
    const catalog = createCatalog();
    const baseline = unwrap(resolve(manifest, catalog));
    const template = baseline.selections[0]!;
    const integration = baseline.selections[1]!;
    const hostileName = "credential-sentinel-must-not-escape";
    const substitutions = [
      { ...template, name: hostileName },
      { ...template, version: "9.0.0" },
    ];

    for (const substitution of substitutions) {
      const resolver: SelectionResolver = {
        resolve: ({ selection }) => (selection.kind === "template" ? substitution : integration),
      };
      const result = synchronous(
        resolveManifest(manifest, catalog, {
          generator,
          resolver,
          catalogAdmission: admitCatalog(catalog),
        }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics).toContainEqual(
          substitution.name === hostileName
            ? {
                code: "unverified-integrity",
                reasonCode: "resolver-coordinate-mismatch",
                path: "/selections/0",
              }
            : {
                code: "unverified-integrity",
                reasonCode: "resolved-version-out-of-range",
                path: "/selections/0/version",
              },
        );
        expect(JSON.stringify(result.diagnostics)).not.toContain(hostileName);
      }
    }
  });

  test("rejects qualification evidence bound to a stale closure subject", () => {
    const catalog = createCatalog();
    const staleBinding = {
      evidence: {
        evidenceId: "00000000-0000-7000-8000-000000000001",
        kind: "evaluation",
        content: {
          resourceId: "00000000-0000-7000-8001-000000000001",
          mediaType: "application/json",
          byteLength: 0,
          digest: digest("9".repeat(64)),
        },
      },
      subjectClosureDigest: digest("0".repeat(64)),
    };
    const staleCatalog = withCatalogEntries(catalog, [
      { ...catalog.entries[0]!, evidence: [staleBinding] },
      catalog.entries[1]!,
    ] as unknown as Catalog["entries"]);

    const result = resolve(createManifest(), staleCatalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some((diagnostic) => diagnostic.code === "evidence-subject-mismatch"),
      ).toBe(true);
    }
  });

  test("rejects catalog content that no longer matches its snapshot digest", () => {
    const catalog = createCatalog();
    const entry = catalog.entries[0]!;
    const replayed = {
      ...catalog,
      entries: [
        {
          ...entry,
          artifactDigest: digest("a".repeat(64)),
          closure: {
            ...entry.closure,
            root: { ...entry.closure.root, digest: digest("a".repeat(64)) },
          },
        },
        catalog.entries[1]!,
      ],
    } as Catalog;

    const result = resolve(createManifest(), replayed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some((diagnostic) => diagnostic.code === "unverified-integrity"),
      ).toBe(true);
    }
  });
});
