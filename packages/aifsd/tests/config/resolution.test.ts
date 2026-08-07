import { describe, expect, test } from "bun:test";

import {
  resolveManifest,
  validateManifest,
  type Manifest,
  type MaybePromise,
  type ResolutionDependencies,
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

const dependenciesFor = (
  catalog: ReturnType<typeof createCatalog>,
  overrides: Partial<ResolutionDependencies> = {},
) => ({ generator, catalogAdmission: admitCatalog(catalog), ...overrides });

const unwrap = <T>(
  result: { ok: true; value: T } | { ok: false; diagnostics: readonly unknown[] },
) => {
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

const thenable = <T>(value: T): PromiseLike<T> => ({
  then: <TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> =>
    Promise.resolve(onfulfilled ? onfulfilled(value) : (value as unknown as TResult1)),
});

const reverseObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(reverseObjectKeys);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, nested]) => [key, reverseObjectKeys(nested)]),
  );
};

describe("configuration resolution", () => {
  test("validates and snapshots a manifest without retaining caller ownership", () => {
    const input = createManifest();
    const result = validateManifest(input);
    const manifest = unwrap(result);

    const mutable = input as unknown as {
      intent: { summary: string; outcomes: string[] };
    };
    mutable.intent.summary = "mutated after registration";
    mutable.intent.outcomes.push("ambient mutation");

    expect(manifest.intent.summary).toBe("Materialize a native Node application");
    expect(manifest.intent.outcomes).not.toContain("ambient mutation");
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.intent)).toBe(true);
  });

  test("resolves deterministically regardless of object insertion order", () => {
    const manifest = createManifest();
    const catalog = createCatalog();
    const first = unwrap(synchronous(resolveManifest(manifest, catalog, dependenciesFor(catalog))));
    const reorderedCatalog = reverseObjectKeys(catalog) as typeof catalog;
    const reordered = unwrap(
      synchronous(
        resolveManifest(
          reverseObjectKeys(manifest) as Manifest,
          reorderedCatalog,
          dependenciesFor(reorderedCatalog, {
            generator: reverseObjectKeys(generator) as typeof generator,
          }),
        ),
      ),
    );

    expect(reordered).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.selections[0]!.trust).toBe("official");
    expect(first.selections[0]!.signature).toBe("fixture:template-signature");
  });

  test("preserves synchronous resolver ports", () => {
    const baseline = unwrap(
      synchronous(
        resolveManifest(createManifest(), createCatalog(), dependenciesFor(createCatalog())),
      ),
    );
    const resolver: SelectionResolver = {
      resolve: ({ selection }) =>
        baseline.selections.find(
          (candidate) => candidate.kind === selection.kind && candidate.name === selection.name,
        ) ?? null,
    };

    const result = resolveManifest(
      createManifest(),
      createCatalog(),
      dependenciesFor(createCatalog(), { resolver }),
    );
    expect(result).not.toBeInstanceOf(Promise);
    expect(unwrap(synchronous(result))).toEqual(baseline);
  });

  test("snapshots catalog metadata without retaining caller ownership", () => {
    const catalog = structuredClone(createCatalog()) as ReturnType<typeof createCatalog>;
    const resolved = unwrap(
      synchronous(resolveManifest(createManifest(), catalog, dependenciesFor(catalog))),
    );
    const mutable = catalog as unknown as {
      identity: { id: string };
      entries: Array<{ name: string }>;
    };

    mutable.identity.id = "mutated-after-resolution";
    mutable.entries[0]!.name = "mutated-entry";

    expect(resolved.catalog.id).toBe("fixture-catalog");
    expect(resolved.selections[0]!.name).toBe("native-node");
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.selections[0]!)).toBe(true);
  });

  test("supports non-native PromiseLike resolver ports without changing semantics", async () => {
    const baseline = unwrap(
      synchronous(
        resolveManifest(createManifest(), createCatalog(), dependenciesFor(createCatalog())),
      ),
    );
    const resolver: SelectionResolver = {
      resolve: ({ selection }) =>
        thenable(
          baseline.selections.find(
            (candidate) => candidate.kind === selection.kind && candidate.name === selection.name,
          ) ?? null,
        ),
    };

    const pending = resolveManifest(
      createManifest(),
      createCatalog(),
      dependenciesFor(createCatalog(), { resolver }),
    );
    expect(pending).toBeInstanceOf(Promise);
    expect(unwrap(await pending)).toEqual(baseline);
  });

  test("uses data-only catalog metadata without executing attached code", () => {
    let executions = 0;
    const catalog = createCatalog();
    const hostileEntry = Object.defineProperty({ ...catalog.entries[0]! }, "activate", {
      enumerable: true,
      get: () => {
        executions += 1;
        return () => {
          executions += 1;
        };
      },
    });

    const result = resolveManifest(
      createManifest(),
      { ...catalog, entries: [hostileEntry, catalog.entries[1]!] } as typeof catalog,
      dependenciesFor(catalog),
    );

    expect(result).not.toBeInstanceOf(Promise);
    expect((result as { ok: boolean }).ok).toBe(false);
    expect(executions).toBe(0);
  });

  test("applies a named environment overlay deterministically", () => {
    const manifest = createManifest();
    const template = createCatalog().entries[0]!;
    const catalog = createCatalog();
    const olderTemplate = {
      ...template,
      version: "1.0.0",
      closure: { ...template.closure, root: { ...template.closure.root, version: "1.0.0" } },
    };
    const catalogWithOlderTemplate = withCatalogEntries(catalog, [
      template,
      olderTemplate,
      catalog.entries[1]!,
    ] as typeof catalog.entries);
    const localManifest: Manifest = {
      ...manifest,
      environments: {
        ...manifest.environments,
        local: {
          ...manifest.environments?.local,
          selections: [
            {
              ...manifest.selections[0]!,
              versionRange: "1.0.0" as Manifest["selections"][number]["versionRange"],
            },
          ],
        },
      },
    };

    const base = unwrap(
      synchronous(
        resolveManifest(localManifest, catalogWithOlderTemplate, {
          generator,
          catalogAdmission: admitCatalog(catalogWithOlderTemplate),
        }),
      ),
    );
    const local = unwrap(
      synchronous(
        resolveManifest(localManifest, catalogWithOlderTemplate, {
          generator,
          catalogAdmission: admitCatalog(catalogWithOlderTemplate),
          environment: "local",
        }),
      ),
    );

    expect(base.selections[0]!.version).toBe("1.2.0");
    expect(local.selections[0]!.version).toBe("1.0.0");
    expect(local).toEqual(
      unwrap(
        synchronous(
          resolveManifest(localManifest, catalogWithOlderTemplate, {
            generator,
            catalogAdmission: admitCatalog(catalogWithOlderTemplate),
            environment: "local",
          }),
        ),
      ),
    );
  });

  test("binds effective overlay settings and secrets into resolved identity", () => {
    const manifest = createManifest();
    const catalog = createCatalog();
    const base = unwrap(synchronous(resolveManifest(manifest, catalog, dependenciesFor(catalog))));
    const local = unwrap(
      synchronous(
        resolveManifest(manifest, catalog, dependenciesFor(catalog, { environment: "local" })),
      ),
    );
    const baseSelection = manifest.selections[0]!;
    const overlaySelection = manifest.environments!.local!.selections![0]!;
    const expectedManifest: Manifest = {
      ...manifest,
      selections: [
        {
          ...baseSelection,
          ...overlaySelection,
          secrets: { ...baseSelection.secrets, ...overlaySelection.secrets },
          settings: { ...baseSelection.settings, ...overlaySelection.settings },
        },
        manifest.selections[1]!,
      ],
    };

    expect(local.selections).toEqual(base.selections);
    expect(local.manifestDigest).not.toEqual(base.manifestDigest);
    expect(local.manifestDigest).toEqual(fixtureContentDigest(expectedManifest));
  });

  test("does not let a custom resolver mutate an effective environment selection", () => {
    const manifest = createManifest();
    const catalog = createCatalog();
    const expected = unwrap(
      synchronous(
        resolveManifest(manifest, catalog, dependenciesFor(catalog, { environment: "local" })),
      ),
    );
    const mutationResults: boolean[] = [];
    const resolver: SelectionResolver = {
      resolve: ({ selection }) => {
        if (selection.kind === "template") {
          expect(Object.isFrozen(selection)).toBe(true);
          expect(Object.isFrozen(selection.settings)).toBe(true);
          mutationResults.push(
            Reflect.set(selection.settings as object, "mode", "resolver-mutated"),
          );
        }
        return (
          expected.selections.find(
            (candidate) => candidate.kind === selection.kind && candidate.name === selection.name,
          ) ?? null
        );
      },
    };

    const resolved = unwrap(
      synchronous(
        resolveManifest(
          manifest,
          catalog,
          dependenciesFor(catalog, { environment: "local", resolver }),
        ),
      ),
    );

    expect(mutationResults).toEqual([false]);
    expect(resolved.manifestDigest).toEqual(expected.manifestDigest);
    expect(resolved.selections).toEqual(expected.selections);
  });

  test("does not match an adjacent arbitrary-precision version for an exact range", () => {
    const manifest = createManifest();
    const catalog = createCatalog();
    const template = catalog.entries[0]!;
    const adjacentVersion = "9007199254740992.0.0";
    const requestedVersion = "9007199254740993.0.0";
    const adjacentTemplate = {
      ...template,
      version: adjacentVersion,
      closure: {
        ...template.closure,
        root: { ...template.closure.root, version: adjacentVersion },
      },
    };
    const adjacentCatalog = withCatalogEntries(catalog, [
      adjacentTemplate,
      catalog.entries[1]!,
    ] as typeof catalog.entries);
    const exactManifest: Manifest = {
      ...manifest,
      selections: [
        {
          ...manifest.selections[0]!,
          versionRange: requestedVersion as Manifest["selections"][number]["versionRange"],
        },
        manifest.selections[1]!,
      ],
    };

    const result = synchronous(
      resolveManifest(exactManifest, adjacentCatalog, dependenciesFor(adjacentCatalog)),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "unresolved-selection",
          reasonCode: "no-matching-release",
          path: "/selections/0",
        }),
      );
    }
  });
});

type _ResolvedConfigurationContract = ResolvedConfiguration;
