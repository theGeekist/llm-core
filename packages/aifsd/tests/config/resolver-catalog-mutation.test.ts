import { describe, expect, test } from "bun:test";

import {
  resolveManifest,
  type Catalog,
  type ConfigurationResult,
  type MaybePromise,
  type ResolvedConfiguration,
  type SelectionResolver,
} from "../../src/config/index.js";
import {
  admitCatalog,
  createCatalog,
  createManifest,
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

const resolveWith = (catalog: Catalog, resolver?: SelectionResolver) =>
  synchronous(
    resolveManifest(createManifest(), catalog, {
      generator,
      resolver,
      catalogAdmission: admitCatalog(catalog),
    }),
  );

const unwrap = (result: ConfigurationResult<ResolvedConfiguration>): ResolvedConfiguration => {
  if (!result.ok) {
    throw new Error(`Fixture construction failed: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.value;
};

describe("custom resolver catalogue authority boundary", () => {
  test("prevents catalogue mutation from forging resolver correspondence", () => {
    const baseline = unwrap(resolveWith(createCatalog()));
    const catalog = createCatalog();
    const forgedTemplate = {
      ...baseline.selections[0]!,
      trust: "local" as const,
      signature: "forged-template-signature",
    };
    let mutationAttempts: readonly boolean[] = [];
    let observedCatalog: Catalog | undefined;
    const resolver: SelectionResolver = {
      resolve: ({ selection, catalog: queryCatalog }) => {
        if (selection.kind !== "template") {
          return baseline.selections[1]!;
        }
        observedCatalog = queryCatalog;
        const template = queryCatalog.entries[0]!;
        mutationAttempts = [
          Reflect.set(queryCatalog.authority as object, "provenance", "forged://catalogue"),
          Reflect.set(template as object, "trust", "local"),
          Reflect.set(template as object, "signature", "forged-template-signature"),
          Reflect.set(queryCatalog.entries as object, 0, {
            ...template,
            trust: "local",
            signature: "forged-template-signature",
          }),
        ];
        return forgedTemplate;
      },
    };

    const result = resolveWith(catalog, resolver);

    expect(mutationAttempts).toEqual([false, false, false, false]);
    expect(observedCatalog?.authority.provenance).toBe("fixture://catalogue/2026-08-06");
    expect(observedCatalog?.entries[0]?.trust).toBe("official");
    expect(observedCatalog?.entries[0]?.signature).toBe("fixture:template-signature");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toContainEqual({
        code: "unverified-integrity",
        reasonCode: "resolver-trust-mismatch",
        path: "/selections/0/trust",
      });
      expect(result.diagnostics).toContainEqual({
        code: "unverified-integrity",
        reasonCode: "resolver-signature-mismatch",
        path: "/selections/0/signature",
      });
    }
  });
});
