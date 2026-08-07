import { describe, expect, test } from "bun:test";
import { digest } from "@geekist/llm-core/contracts";

import {
  resolveManifest,
  type CatalogEntry,
  type Manifest,
  type MaybePromise,
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

const manifestWithRange = (versionRange: string): Manifest => {
  const manifest = createManifest();
  return {
    ...manifest,
    selections: [{ ...manifest.selections[0]!, versionRange }, manifest.selections[1]!],
  };
};

const templateAt = (base: CatalogEntry, version: string, digestCharacter: string): CatalogEntry => {
  const artifactDigest = digest(digestCharacter.repeat(64));
  return {
    ...base,
    version,
    artifactDigest,
    closure: {
      ...base.closure,
      root: { ...base.closure.root, version, digest: artifactDigest },
    },
  };
};

describe("zero-major caret version ranges", () => {
  test("selects the highest 0.2.x release for ^0.2.3 without crossing into 0.3.0", () => {
    const catalog = createCatalog();
    const template = catalog.entries[0]!;
    const rangedCatalog = withCatalogEntries(catalog, [
      templateAt(template, "0.2.3", "4"),
      templateAt(template, "0.2.9", "5"),
      templateAt(template, "0.3.0", "6"),
      catalog.entries[1]!,
    ]);
    const result = synchronous(
      resolveManifest(manifestWithRange("^0.2.3"), rangedCatalog, {
        generator,
        catalogAdmission: admitCatalog(rangedCatalog),
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.selections[0]!.version).toBe("0.2.9");
    }
  });

  test("does not treat 0.0.4 as satisfying ^0.0.3", () => {
    const catalog = createCatalog();
    const rangedCatalog = withCatalogEntries(catalog, [
      templateAt(catalog.entries[0]!, "0.0.4", "7"),
      catalog.entries[1]!,
    ]);
    const result = synchronous(
      resolveManifest(manifestWithRange("^0.0.3"), rangedCatalog, {
        generator,
        catalogAdmission: admitCatalog(rangedCatalog),
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some((diagnostic) => diagnostic.code === "unresolved-selection"),
      ).toBe(true);
    }
  });
});
