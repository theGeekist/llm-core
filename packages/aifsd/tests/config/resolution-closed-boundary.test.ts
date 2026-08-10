import { describe, expect, test } from "bun:test";
import { digest } from "@aifsd/llm-core/contracts";

import {
  resolveManifest,
  type Catalog,
  type CatalogEntry,
  type ConfigurationResult,
  type GeneratorIdentity,
  type MaybePromise,
  type ResolvedConfiguration,
  type ResolvedSelection,
  type SelectionResolver,
} from "../../src/config/index.js";
import {
  admitCatalog,
  createCatalog,
  createManifest,
  fixtureContentDigest,
  generator,
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

const resolverReturning = (
  template: ResolvedSelection,
  integration: ResolvedSelection,
): SelectionResolver => ({
  resolve: ({ selection }) => (selection.kind === "template" ? template : integration),
});

const omit = (value: ResolvedSelection, key: keyof ResolvedSelection): ResolvedSelection => {
  const clone = { ...value } as Record<string, unknown>;
  delete clone[key];
  return clone as unknown as ResolvedSelection;
};

const sealCatalog = (catalog: Catalog): Catalog => {
  const snapshot = {
    identity: catalog.identity,
    sequence: catalog.sequence,
    authority: catalog.authority,
    entries: catalog.entries,
  };
  return { ...catalog, snapshotDigest: fixtureContentDigest(snapshot) };
};

const replaceTemplateEntry = (catalog: Catalog, entry: unknown): Catalog =>
  sealCatalog({
    ...catalog,
    entries: [entry, catalog.entries[1]!],
  } as unknown as Catalog);

const evidenceBinding = (subjectClosureDigest: ResolvedSelection["closureDigest"]) => ({
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
  subjectClosureDigest,
});

describe("closed custom resolver boundary", () => {
  test.each([
    {
      field: "trust",
      mutate: (selection: ResolvedSelection) => ({ ...selection, trust: "verified" as const }),
    },
    {
      field: "signature",
      mutate: (selection: ResolvedSelection) => ({
        ...selection,
        signature: "forged-publisher-signature",
      }),
    },
  ])("rejects forged $field on otherwise exact custom resolver metadata", ({ mutate }) => {
    const catalog = createCatalog();
    const baseline = unwrap(resolveSafely(catalog));
    const resolver = resolverReturning(mutate(baseline.selections[0]!), baseline.selections[1]!);

    expectRejected(resolveSafely(catalog, { generator, resolver }));
  });

  test.each(["closure", "closureDigest", "artifactDigest", "trust", "evidence"] as const)(
    "rejects custom resolver output missing %s without throwing",
    (field) => {
      const catalog = createCatalog();
      const baseline = unwrap(resolveSafely(catalog));
      const resolver = resolverReturning(
        omit(baseline.selections[0]!, field),
        baseline.selections[1]!,
      );

      expectRejected(resolveSafely(catalog, { generator, resolver }));
    },
  );
});

describe("closed generator boundary", () => {
  test.each([
    {
      label: "missing id",
      value: { version: generator.version, artifactDigest: generator.artifactDigest },
    },
    {
      label: "missing version",
      value: { id: generator.id, artifactDigest: generator.artifactDigest },
    },
    { label: "missing digest", value: { id: generator.id, version: generator.version } },
    {
      label: "invalid digest",
      value: { ...generator, artifactDigest: { algorithm: "md5", value: "short" } },
    },
    { label: "unknown field", value: { ...generator, ambientGrant: true } },
  ])("rejects $label", ({ value }) => {
    expectRejected(
      resolveSafely(createCatalog(), { generator: value as unknown as GeneratorIdentity }),
    );
  });
});

describe("closed catalogue structures", () => {
  test.each([
    {
      label: "catalogue root",
      mutate: (catalog: Catalog) => ({ ...catalog, ambientGrant: true }),
    },
    {
      label: "catalogue identity",
      mutate: (catalog: Catalog) => ({
        ...catalog,
        identity: { ...catalog.identity, ambientGrant: true },
      }),
    },
    {
      label: "catalogue authority",
      mutate: (catalog: Catalog) => ({
        ...catalog,
        authority: { ...catalog.authority, ambientGrant: true },
      }),
    },
    {
      label: "catalogue entry",
      mutate: (catalog: Catalog) =>
        replaceTemplateEntry(catalog, { ...catalog.entries[0]!, ambientGrant: true }),
    },
    {
      label: "executable closure",
      mutate: (catalog: Catalog) => {
        const entry = catalog.entries[0]!;
        return replaceTemplateEntry(catalog, {
          ...entry,
          closure: { ...entry.closure, ambientGrant: true },
        });
      },
    },
    {
      label: "closure root",
      mutate: (catalog: Catalog) => {
        const entry = catalog.entries[0]!;
        return replaceTemplateEntry(catalog, {
          ...entry,
          closure: {
            ...entry.closure,
            root: { ...entry.closure.root, ambientGrant: true },
          },
        });
      },
    },
    {
      label: "closure representation",
      mutate: (catalog: Catalog) => {
        const entry = catalog.entries[0]!;
        return replaceTemplateEntry(catalog, {
          ...entry,
          closure: {
            ...entry.closure,
            representation: { ...entry.closure.representation, ambientGrant: true },
          },
        });
      },
    },
    {
      label: "closure member",
      mutate: (catalog: Catalog) => {
        const entry = catalog.entries[0]!;
        if (entry.closure.representation.kind !== "members") {
          throw new Error("Fixture requires member closure representation");
        }
        return replaceTemplateEntry(catalog, {
          ...entry,
          closure: {
            ...entry.closure,
            representation: {
              kind: "members",
              members: [{ ...entry.closure.representation.members[0]!, ambientGrant: true }],
            },
          },
        });
      },
    },
  ])("rejects an unknown field on the $label", ({ mutate }) => {
    const mutated = mutate(createCatalog()) as Catalog;
    expectRejected(resolveSafely(sealCatalog(mutated)));
  });

  test.each(["binding", "reference", "content"])(
    "rejects an unknown field on the evidence %s",
    (location) => {
      const catalog = createCatalog();
      const baseline = unwrap(resolveSafely(catalog));
      const binding = evidenceBinding(baseline.selections[0]!.closureDigest);
      const mutated =
        location === "binding"
          ? { ...binding, ambientGrant: true }
          : location === "reference"
            ? { ...binding, evidence: { ...binding.evidence, ambientGrant: true } }
            : {
                ...binding,
                evidence: {
                  ...binding.evidence,
                  content: { ...binding.evidence.content, ambientGrant: true },
                },
              };
      const entry = { ...catalog.entries[0]!, evidence: [mutated] };

      expectRejected(resolveSafely(replaceTemplateEntry(catalog, entry)));
    },
  );

  test.each([
    { field: "resourceId", value: null },
    { field: "mediaType", value: "" },
    { field: "byteLength", value: -1 },
    { field: "byteLength", value: 1.5 },
  ])("rejects malformed evidence content $field %#", ({ field, value }) => {
    const catalog = createCatalog();
    const baseline = unwrap(resolveSafely(catalog));
    const binding = evidenceBinding(baseline.selections[0]!.closureDigest);
    const entry = {
      ...catalog.entries[0]!,
      evidence: [
        {
          ...binding,
          evidence: {
            ...binding.evidence,
            content: { ...binding.evidence.content, [field]: value },
          },
        },
      ],
    } as unknown as CatalogEntry;

    expectRejected(resolveSafely(replaceTemplateEntry(catalog, entry)));
  });

  test("rejects duplicate identical catalogue coordinates", () => {
    const catalog = createCatalog();
    const duplicate = { ...catalog.entries[0]! };
    const withDuplicate = sealCatalog({
      ...catalog,
      entries: [catalog.entries[0]!, duplicate, catalog.entries[1]!],
    });

    expectRejected(resolveSafely(withDuplicate));
  });
});
