import { describe, expect, test } from "bun:test";
import { digest, type EvidenceRef } from "@geekist/llm-core/contracts";

import {
  createConfigurationLock,
  resolveManifest,
  type Catalog,
  type ConfigurationLock,
  type ConfigurationResult,
  type EvidenceBinding,
  type MaybePromise,
} from "../../src/config/index.js";
import {
  admitCatalog,
  createCatalog,
  createLockInput,
  createManifest,
  digests,
  generator,
  withCatalogEntries,
} from "./fixtures/configuration.js";

const unwrap = <T>(result: ConfigurationResult<T>): T => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected success, received ${JSON.stringify(result.diagnostics)}`);
  }
  return result.value;
};

const synchronous = <T>(value: MaybePromise<T>): T => {
  if (typeof value === "object" && value !== null && "then" in value) {
    throw new Error("Expected synchronous MaybePromise branch");
  }
  return value as T;
};

const resolveAndLock = (
  catalog: Catalog = createCatalog(),
  selectedGenerator = generator,
  inputs = createLockInput(),
): ConfigurationLock => {
  const resolved = resolveManifest(createManifest(), catalog, {
    generator: selectedGenerator,
    catalogAdmission: admitCatalog(catalog),
  });
  expect(resolved).not.toBeInstanceOf(Promise);
  return unwrap(createConfigurationLock(unwrap(synchronous(resolved)), inputs));
};

const evidence = (suffix: string): EvidenceRef =>
  ({
    evidenceId: `00000000-0000-7000-8000-${suffix.padStart(12, "0")}`,
    kind: "evaluation",
    content: {
      resourceId: `00000000-0000-7000-8001-${suffix.padStart(12, "0")}`,
      mediaType: "application/json",
      byteLength: 0,
      digest: digest(suffix.padStart(64, "0")),
    },
  }) as EvidenceRef;

const evidenceBinding = (catalog: Catalog, suffix: string): EvidenceBinding => {
  const resolved = unwrap(
    synchronous(
      resolveManifest(createManifest(), catalog, {
        generator,
        catalogAdmission: admitCatalog(catalog),
      }),
    ),
  );
  return {
    evidence: evidence(suffix),
    subjectClosureDigest: resolved.selections[0]!.closureDigest,
  };
};

describe("configuration lock identity", () => {
  test("binds every resolved dependency and exact evidence subject", () => {
    const original = createCatalog();
    const catalog = withCatalogEntries(original, [
      { ...original.entries[0]!, evidence: [evidenceBinding(original, "4")] },
      original.entries[1]!,
    ]);
    const lock = resolveAndLock(catalog);

    expect(lock.dependencies).toHaveLength(2);
    expect(lock.dependencies[0]!.evidence[0]!.subjectClosureDigest).toEqual(
      lock.dependencies[0]!.closureDigest,
    );
  });

  test("changes when a transitive member changes while the root stays fixed", () => {
    const baselineCatalog = createCatalog();
    const changedCatalogInput = createCatalog();
    const template = changedCatalogInput.entries[0]!;
    if (template.closure.representation.kind !== "members") {
      throw new Error("Fixture requires member closure representation");
    }
    const changedTemplate = {
      ...template,
      closure: {
        ...template.closure,
        representation: {
          kind: "members",
          members: [
            { ...template.closure.representation.members[0]!, digest: digest("5".repeat(64)) },
          ],
        },
      },
    };
    const changedCatalog = withCatalogEntries(changedCatalogInput, [
      changedTemplate,
      changedCatalogInput.entries[1]!,
    ] as Catalog["entries"]);

    const baseline = resolveAndLock(baselineCatalog);
    const changed = resolveAndLock(changedCatalog);

    expect(changed.dependencies[0]!.artifactDigest).toEqual(
      baseline.dependencies[0]!.artifactDigest,
    );
    expect(changed.dependencies[0]!.closureDigest).not.toEqual(
      baseline.dependencies[0]!.closureDigest,
    );
    expect(changed).not.toEqual(baseline);
  });

  test("rejects an incomplete executable dependency closure", () => {
    const original = createCatalog();
    const template = original.entries[0]!;
    const catalog = withCatalogEntries(original, [
      {
        ...template,
        closure: {
          ...template.closure,
          representation: { kind: "members", members: [] },
        },
      },
      original.entries[1]!,
    ]);
    const resolution = synchronous(
      resolveManifest(createManifest(), catalog, {
        generator,
        catalogAdmission: admitCatalog(catalog),
      }),
    );
    const result = resolution.ok
      ? createConfigurationLock(resolution.value, createLockInput())
      : resolution;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some((diagnostic) => diagnostic.code === "closure-incomplete"),
      ).toBe(true);
    }
  });

  test("changes for package-manager lock, template, generator, evidence and materialization inputs", () => {
    const baseline = resolveAndLock();

    const packageLockCatalogInput = createCatalog();
    const integration = packageLockCatalogInput.entries[1]!;
    const changedIntegration = {
      ...integration,
      closure: {
        ...integration.closure,
        representation: { kind: "package-lock", lockDigest: digest("6".repeat(64)) },
      },
    };
    const packageLockCatalog = withCatalogEntries(packageLockCatalogInput, [
      packageLockCatalogInput.entries[0]!,
      changedIntegration,
    ] as Catalog["entries"]);

    const templateCatalogInput = createCatalog();
    const template = templateCatalogInput.entries[0]!;
    const changedTemplate = {
      ...template,
      artifactDigest: digest("7".repeat(64)),
      closure: {
        ...template.closure,
        root: { ...template.closure.root, digest: digest("7".repeat(64)) },
      },
    };
    const templateCatalog = withCatalogEntries(templateCatalogInput, [
      changedTemplate,
      templateCatalogInput.entries[1]!,
    ] as Catalog["entries"]);

    const evidenceCatalogInput = createCatalog();
    const evidenceCatalog = withCatalogEntries(evidenceCatalogInput, [
      {
        ...evidenceCatalogInput.entries[0]!,
        evidence: [evidenceBinding(evidenceCatalogInput, "8")],
      },
      evidenceCatalogInput.entries[1]!,
    ]);

    const changedGenerator = { ...generator, artifactDigest: digest("9".repeat(64)) };
    const changedInputs = {
      ...createLockInput(),
      materializationInputsDigest: digest("0".repeat(64)),
    };

    expect(resolveAndLock(packageLockCatalog)).not.toEqual(baseline);
    expect(resolveAndLock(templateCatalog)).not.toEqual(baseline);
    expect(resolveAndLock(createCatalog(), changedGenerator)).not.toEqual(baseline);
    expect(resolveAndLock(evidenceCatalog)).not.toEqual(baseline);
    expect(resolveAndLock(createCatalog(), generator, changedInputs)).not.toEqual(baseline);
  });

  test("keeps the root artifact fixed in package-manager lock drift evidence", () => {
    const original = createCatalog();
    const baselineRoot = original.entries[1]!.artifactDigest;
    const integration = original.entries[1]!;
    const changedIntegration = {
      ...integration,
      closure: {
        ...integration.closure,
        representation: { kind: "package-lock", lockDigest: digests.integrationDependency },
      },
    };
    const catalog = withCatalogEntries(original, [
      original.entries[0]!,
      changedIntegration,
    ] as Catalog["entries"]);

    const lock = resolveAndLock(catalog);
    expect(lock.dependencies[1]!.artifactDigest).toEqual(baselineRoot);
  });

  test("carries the canonical resolved manifest digest into the lock", () => {
    const firstManifest = createManifest();
    const firstResolved = unwrap(
      synchronous(
        resolveManifest(firstManifest, createCatalog(), {
          generator,
          catalogAdmission: admitCatalog(createCatalog()),
        }),
      ),
    );
    const changedManifest = {
      ...firstManifest,
      intent: { ...firstManifest.intent, summary: "A different manifest" },
    };
    const changedResolved = unwrap(
      synchronous(
        resolveManifest(changedManifest, createCatalog(), {
          generator,
          catalogAdmission: admitCatalog(createCatalog()),
        }),
      ),
    );
    const firstLock = unwrap(createConfigurationLock(firstResolved, createLockInput()));
    const changedLock = unwrap(createConfigurationLock(changedResolved, createLockInput()));

    expect(firstLock.manifestDigest).toEqual(firstResolved.manifestDigest);
    expect(changedLock.manifestDigest).toEqual(changedResolved.manifestDigest);
    expect(changedLock.manifestDigest).not.toEqual(firstLock.manifestDigest);
  });

  test("rejects recorded resolution facts that contradict the selected release", () => {
    const catalog = createCatalog();
    const resolved = unwrap(
      synchronous(
        resolveManifest(createManifest(), catalog, {
          generator,
          catalogAdmission: admitCatalog(catalog),
        }),
      ),
    );
    const forged = structuredClone(resolved) as unknown as typeof resolved;
    const mutable = forged as unknown as {
      resolutionDecisions: Array<{ selectedVersion: string }>;
    };
    mutable.resolutionDecisions[0]!.selectedVersion = "999.0.0";

    const result = createConfigurationLock(forged, createLockInput());

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: "unverified-integrity",
          reasonCode: "resolution-decision-mismatch",
          path: "/resolutionDecisions/0",
        },
      ],
    });
  });

  test("rejects recorded resolution rationale that is not supported by its candidates", () => {
    const catalog = createCatalog();
    const resolved = unwrap(
      synchronous(
        resolveManifest(createManifest(), catalog, {
          generator,
          catalogAdmission: admitCatalog(catalog),
        }),
      ),
    );
    const forged = structuredClone(resolved) as unknown as typeof resolved;
    const mutable = forged as unknown as {
      resolutionDecisions: Array<{
        requestedVersionRange: string;
        versionReasonCode: "compatible-release-selected";
        eligibleVersions: string[];
      }>;
    };
    mutable.resolutionDecisions[0]!.requestedVersionRange = "0.0.1";
    mutable.resolutionDecisions[0]!.versionReasonCode = "compatible-release-selected";
    mutable.resolutionDecisions[0]!.eligibleVersions = ["999.0.0", "1.2.0"];

    const result = createConfigurationLock(forged, createLockInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toContainEqual({
        code: "unverified-integrity",
        reasonCode: "resolution-decision-mismatch",
        path: "/resolutionDecisions/0",
      });
    }
  });

  test("snapshots and freezes lock inputs without retaining caller ownership", () => {
    const resolved = unwrap(
      synchronous(
        resolveManifest(createManifest(), createCatalog(), {
          generator,
          catalogAdmission: admitCatalog(createCatalog()),
        }),
      ),
    );
    const mutableResolved = structuredClone(resolved) as unknown as typeof resolved;
    const lock = unwrap(createConfigurationLock(mutableResolved, createLockInput()));
    const mutable = mutableResolved as unknown as {
      catalog: { id: string };
      generator: { id: string };
      selections: Array<{ name: string }>;
    };

    mutable.catalog.id = "mutated-catalog";
    mutable.generator.id = "mutated-generator";
    mutable.selections[0]!.name = "mutated-selection";

    expect(lock.catalog.id).toBe("fixture-catalog");
    expect(lock.generator.id).toBe("aifsd.native-esm");
    expect(lock.dependencies[0]!.name).toBe("native-node");
    expect(Object.isFrozen(lock)).toBe(true);
    expect(Object.isFrozen(lock.dependencies[0]!)).toBe(true);
  });
});
