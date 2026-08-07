import { describe, expect, test } from "bun:test";

import {
  resolveManifest,
  type ConfigurationResult,
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
} from "./fixtures/configuration.js";

const synchronous = <T>(value: MaybePromise<T>): T => {
  if (value instanceof Promise) {
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

const baselineConfiguration = (): ResolvedConfiguration =>
  unwrap(
    synchronous(
      resolveManifest(createManifest(), createCatalog(), {
        generator,
        catalogAdmission: admitCatalog(createCatalog()),
      }),
    ),
  );

const resolverWithTemplate = (
  template: ResolvedSelection | PromiseLike<ResolvedSelection>,
  baseline: ResolvedConfiguration,
): SelectionResolver => ({
  resolve: ({ selection }) => (selection.kind === "template" ? template : baseline.selections[1]!),
});

const resolveWith = (resolver: SelectionResolver) =>
  resolveManifest(createManifest(), createCatalog(), {
    generator,
    resolver,
    catalogAdmission: admitCatalog(createCatalog()),
  });

describe("custom resolver thenable boundary", () => {
  test("rejects an own throwing then accessor without reading it or throwing", () => {
    const baseline = baselineConfiguration();
    let thenReads = 0;
    const hostile = Object.defineProperty({ ...baseline.selections[0]! }, "then", {
      enumerable: true,
      get: () => {
        thenReads += 1;
        throw new Error("then accessor must not execute");
      },
    }) as ResolvedSelection;
    let result: ConfigurationResult<ResolvedConfiguration> | undefined;

    expect(() => {
      result = synchronous(resolveWith(resolverWithTemplate(hostile, baseline)));
    }).not.toThrow();

    expect(result?.ok).toBe(false);
    if (result?.ok === false) {
      expect(result.diagnostics.length).toBeGreaterThan(0);
    }
    expect(thenReads).toBe(0);
  });

  test("diagnoses a proxy whose then descriptor trap throws without reading resolver fields", () => {
    const baseline = baselineConfiguration();
    let descriptorTraps = 0;
    let fieldReads = 0;
    const target = Object.defineProperties(
      { ...baseline.selections[0]!, then: () => undefined },
      {
        closureDigest: {
          enumerable: true,
          get: () => {
            fieldReads += 1;
            throw new Error("resolver field must not execute");
          },
        },
      },
    );
    const hostile = new Proxy(target, {
      getOwnPropertyDescriptor: (value, key) => {
        if (key === "then") {
          descriptorTraps += 1;
          throw new Error("then descriptor trap");
        }
        return Reflect.getOwnPropertyDescriptor(value, key);
      },
    }) as ResolvedSelection;
    let result: ConfigurationResult<ResolvedConfiguration> | undefined;

    expect(() => {
      result = synchronous(resolveWith(resolverWithTemplate(hostile, baseline)));
    }).not.toThrow();

    expect(result?.ok).toBe(false);
    if (result?.ok === false) {
      expect(result.diagnostics.length).toBeGreaterThan(0);
    }
    expect(descriptorTraps).toBeGreaterThan(0);
    expect(fieldReads).toBe(0);
  });

  test("diagnoses a proxy whose prototype trap throws without reading resolver fields", () => {
    const baseline = baselineConfiguration();
    let prototypeTraps = 0;
    let fieldReads = 0;
    const target = Object.defineProperty({ ...baseline.selections[0]! }, "closureDigest", {
      enumerable: true,
      get: () => {
        fieldReads += 1;
        throw new Error("resolver field must not execute");
      },
    });
    const hostile = new Proxy(target, {
      getPrototypeOf: () => {
        prototypeTraps += 1;
        throw new Error("prototype trap");
      },
    }) as ResolvedSelection;
    let result: ConfigurationResult<ResolvedConfiguration> | undefined;

    expect(() => {
      result = synchronous(resolveWith(resolverWithTemplate(hostile, baseline)));
    }).not.toThrow();

    expect(result?.ok).toBe(false);
    if (result?.ok === false) {
      expect(result.diagnostics.length).toBeGreaterThan(0);
    }
    expect(prototypeTraps).toBeGreaterThan(0);
    expect(fieldReads).toBe(0);
  });

  test("preserves native Promise resolver semantics", async () => {
    const baseline = baselineConfiguration();
    const resolver: SelectionResolver = {
      resolve: ({ selection }) =>
        Promise.resolve(
          baseline.selections.find(
            (candidate) => candidate.kind === selection.kind && candidate.name === selection.name,
          ) ?? null,
        ),
    };

    const pending = resolveWith(resolver);

    expect(pending).toBeInstanceOf(Promise);
    expect(unwrap(await pending)).toEqual(baseline);
  });
});
