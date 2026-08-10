import { describe, expect, test } from "bun:test";
import { digest, schemaRef } from "@aifsd/llm-core/contracts";

import {
  resolveManifest,
  type Catalog,
  type CatalogAdmission,
  type CatalogEntry,
  type ConfigurationResult,
  type Manifest,
  type MaybePromise,
  type ResolvedConfiguration,
  type ResolvedSelection,
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
  catalog: unknown,
  manifest: Manifest = createManifest(),
  resolver?: SelectionResolver,
  catalogAdmission: CatalogAdmission = admitCatalog(createCatalog()),
) => {
  let result: ConfigurationResult<ResolvedConfiguration> | undefined;
  expect(() => {
    result = synchronous(
      resolveManifest(manifest, catalog as Catalog, {
        generator,
        catalogAdmission,
        ...(resolver === undefined ? {} : { resolver }),
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

const validEvidence = (subjectClosureDigest: ResolvedSelection["closureDigest"]) => ({
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

describe("hostile resolver roots and outputs", () => {
  test.each([{ value: null }, { value: 17 }, { value: [] }])(
    "rejects a malformed catalogue root with diagnostics %#",
    ({ value }) => {
      expectRejected(resolveSafely(value));
    },
  );

  test.each([
    {
      label: "empty closure",
      mutate: (selection: ResolvedSelection) => ({ ...selection, closure: {} }),
    },
    {
      label: "empty evidence binding",
      mutate: (selection: ResolvedSelection) => ({ ...selection, evidence: [{}] }),
    },
    {
      label: "unknown top-level field",
      mutate: (selection: ResolvedSelection) => ({ ...selection, ambientGrant: true }),
    },
    {
      label: "unknown closure field",
      mutate: (selection: ResolvedSelection) => ({
        ...selection,
        closure: { ...selection.closure, ambientGrant: true },
      }),
    },
    {
      label: "unknown closure-root field",
      mutate: (selection: ResolvedSelection) => ({
        ...selection,
        closure: {
          ...selection.closure,
          root: { ...selection.closure.root, ambientGrant: true },
        },
      }),
    },
    {
      label: "unknown evidence-binding field",
      mutate: (selection: ResolvedSelection) => ({
        ...selection,
        evidence: [{ ...validEvidence(selection.closureDigest), ambientGrant: true }],
      }),
    },
  ])("rejects custom resolver output with $label", ({ mutate }) => {
    const catalog = createCatalog();
    const baseline = unwrap(resolveSafely(catalog));
    const resolver = resolverReturning(
      mutate(baseline.selections[0]!) as ResolvedSelection,
      baseline.selections[1]!,
    );

    expectRejected(resolveSafely(catalog, createManifest(), resolver));
  });
});

describe("catalogue ambiguity and trust-aware selection", () => {
  test.each([
    { field: "trust", reverse: false },
    { field: "trust", reverse: true },
    { field: "signature", reverse: false },
    { field: "signature", reverse: true },
    { field: "evidence", reverse: false },
    { field: "evidence", reverse: true },
  ])("rejects same-coordinate $field ambiguity in both input orders %#", ({ field, reverse }) => {
    const catalog = createCatalog();
    const baseline = unwrap(resolveSafely(catalog));
    const original = catalog.entries[0]!;
    const conflicting = {
      ...original,
      ...(field === "trust" ? { trust: "verified" as const } : {}),
      ...(field === "signature" ? { signature: "different-publisher-signature" } : {}),
      ...(field === "evidence"
        ? { evidence: [validEvidence(baseline.selections[0]!.closureDigest)] }
        : {}),
    } as unknown as CatalogEntry;
    const pair = reverse ? [conflicting, original] : [original, conflicting];
    const ambiguous = withCatalogEntries(catalog, [...pair, catalog.entries[1]!]);

    expectRejected(resolveSafely(ambiguous));
  });

  test.each([{ reverse: false }, { reverse: true }])(
    "rejects a tied coordinate with semantically identical member order in both catalogue orders %#",
    ({ reverse }) => {
      const catalog = createCatalog();
      const template = catalog.entries[0]!;
      if (template.closure.representation.kind !== "members") {
        throw new Error("Fixture requires member closure representation");
      }
      const members = [
        ...template.closure.representation.members,
        { id: "secondary-renderer", version: "1.0.0", digest: digest("7".repeat(64)) },
      ];
      const forward: CatalogEntry = {
        ...template,
        closure: {
          ...template.closure,
          representation: { kind: "members", members },
        },
      };
      const reversed: CatalogEntry = {
        ...forward,
        closure: {
          ...forward.closure,
          representation: { kind: "members", members: [...members].reverse() },
        },
      };
      const pair = reverse ? [reversed, forward] : [forward, reversed];
      const baseline = unwrap(resolveSafely(catalog));
      let resolverCalls = 0;
      const resolver: SelectionResolver = {
        resolve: ({ selection }) => {
          resolverCalls += 1;
          return selection.kind === "template" ? baseline.selections[0]! : baseline.selections[1]!;
        },
      };
      const result = resolveSafely(
        withCatalogEntries(catalog, [...pair, catalog.entries[1]!]),
        createManifest(),
        resolver,
      );

      expectRejected(result);
      expect(resolverCalls).toBe(0);
    },
  );

  test("filters by trust before selecting the newest satisfying version", () => {
    const catalog = createCatalog();
    const trusted = catalog.entries[0]!;
    const newerDigest = digest("8".repeat(64));
    const newerSigned: CatalogEntry = {
      ...trusted,
      version: "1.3.0",
      artifactDigest: newerDigest,
      closure: {
        ...trusted.closure,
        root: { ...trusted.closure.root, version: "1.3.0", digest: newerDigest },
      },
      trust: "verified",
    };
    const manifest = createManifest();
    const trustedManifest: Manifest = {
      ...manifest,
      selections: [
        { ...manifest.selections[0]!, trust: { minimum: "official" } },
        manifest.selections[1]!,
      ],
    };
    const trustCatalog = withCatalogEntries(catalog, [trusted, newerSigned, catalog.entries[1]!]);
    const result = resolveSafely(
      trustCatalog,
      trustedManifest,
      undefined,
      admitCatalog(trustCatalog),
    );

    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.value.selections[0]!.version).toBe(trusted.version);
    }
  });
});

describe("catalogue evidence reference contracts", () => {
  test.each([
    {
      label: "non-canonical evidenceId",
      mutate: (binding: ReturnType<typeof validEvidence>) => ({
        ...binding,
        evidence: { ...binding.evidence, evidenceId: "not-a-canonical-evidence-id" },
      }),
    },
    {
      label: "non-canonical resourceId",
      mutate: (binding: ReturnType<typeof validEvidence>) => ({
        ...binding,
        evidence: {
          ...binding.evidence,
          content: { ...binding.evidence.content, resourceId: "not-a-canonical-resource-id" },
        },
      }),
    },
    {
      label: "unknown evidence kind",
      mutate: (binding: ReturnType<typeof validEvidence>) => ({
        ...binding,
        evidence: { ...binding.evidence, kind: "ambient-authority" },
      }),
    },
    {
      label: "invalid media type",
      mutate: (binding: ReturnType<typeof validEvidence>) => ({
        ...binding,
        evidence: {
          ...binding.evidence,
          content: { ...binding.evidence.content, mediaType: "application json" },
        },
      }),
    },
  ])("rejects $label", ({ mutate }) => {
    const catalog = createCatalog();
    const baseline = unwrap(resolveSafely(catalog));
    const binding = mutate(validEvidence(baseline.selections[0]!.closureDigest));
    const withEvidence = withCatalogEntries(catalog, [
      { ...catalog.entries[0]!, evidence: [binding] } as unknown as CatalogEntry,
      catalog.entries[1]!,
    ]);

    expectRejected(resolveSafely(withEvidence));
  });

  test("accepts a legitimate evidence reference with an optional schema", () => {
    const catalog = createCatalog();
    const baseline = unwrap(resolveSafely(catalog));
    const binding = validEvidence(baseline.selections[0]!.closureDigest);
    const withSchema = {
      ...binding,
      evidence: {
        ...binding.evidence,
        schema: schemaRef({
          schemaId: "https://schemas.example.test/evidence.json",
          version: "1.0.0",
          digest: digest("a".repeat(64)),
        }),
      },
    };
    const withEvidence = withCatalogEntries(catalog, [
      { ...catalog.entries[0]!, evidence: [withSchema] } as unknown as CatalogEntry,
      catalog.entries[1]!,
    ]);

    expect(
      resolveSafely(withEvidence, createManifest(), undefined, admitCatalog(withEvidence))?.ok,
    ).toBe(true);
  });
});
