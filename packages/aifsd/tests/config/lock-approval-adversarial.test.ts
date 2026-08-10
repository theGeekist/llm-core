import { describe, expect, test } from "bun:test";
import { digest } from "@geekist/llm-core/contracts";

import {
  createConfigurationLock,
  resolveManifest,
  type ConfigurationLockInput,
  type ConfigurationLock,
  type ConfigurationResult,
  type MaybePromise,
  type ResolvedConfiguration,
} from "../../src/config/index.js";
import {
  admitCatalog,
  createCatalog,
  createLockInput,
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

const unwrap = <T>(result: ConfigurationResult<T>): T => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return result.value;
};

const baseline = () => {
  const resolved = unwrap(
    synchronous(
      resolveManifest(createManifest(), createCatalog(), {
        generator,
        catalogAdmission: admitCatalog(createCatalog()),
      }),
    ),
  );
  const approvedLock = unwrap(createConfigurationLock(resolved, createLockInput()));
  return { resolved, approvedLock };
};

const withApproved = (
  approvedLock: ConfigurationLock,
  overrides: Partial<ConfigurationLockInput> = {},
): ConfigurationLockInput => ({
  ...createLockInput(),
  ...overrides,
  approvedLock,
});

const expectRejected = (
  resolved: ResolvedConfiguration,
  inputs: ConfigurationLockInput,
): ConfigurationResult<ConfigurationLock> => {
  let result: ConfigurationResult<ConfigurationLock> | undefined;
  expect(() => {
    result = createConfigurationLock(resolved, inputs);
  }).not.toThrow();
  expect(result?.ok).toBe(false);
  if (result === undefined) {
    throw new Error("Expected diagnostics rather than an exception");
  }
  return result;
};

describe("approved configuration lock verification", () => {
  test("accepts an approved lock that exactly matches the rebuilt lock", () => {
    const { resolved, approvedLock } = baseline();
    expect(createConfigurationLock(resolved, withApproved(approvedLock)).ok).toBe(true);
  });

  test("rejects transitive executable closure drift", () => {
    const { resolved, approvedLock } = baseline();
    const selection = resolved.selections[0]!;
    if (selection.closure.representation.kind !== "members") {
      throw new Error("Fixture requires member closure representation");
    }
    const changed = {
      ...resolved,
      selections: [
        {
          ...selection,
          closure: {
            ...selection.closure,
            representation: {
              kind: "members" as const,
              members: selection.closure.representation.members.map((member, index) =>
                index === 0 ? { ...member, digest: digest("4".repeat(64)) } : member,
              ),
            },
          },
        },
        resolved.selections[1]!,
      ],
    };

    expectRejected(changed, withApproved(approvedLock));
  });

  test("rejects qualification evidence drift", () => {
    const { resolved, approvedLock } = baseline();
    const selection = resolved.selections[0]!;
    const changed = {
      ...resolved,
      selections: [
        {
          ...selection,
          evidence: [
            {
              evidence: {
                evidenceId: "00000000-0000-7000-8000-000000000001",
                kind: "evaluation",
                content: {
                  resourceId: "00000000-0000-7000-8001-000000000001",
                  mediaType: "application/json",
                  byteLength: 0,
                  digest: digest("5".repeat(64)),
                },
              },
              subjectClosureDigest: selection.closureDigest,
            },
          ],
        },
        resolved.selections[1]!,
      ],
    } as ResolvedConfiguration;

    expectRejected(changed, withApproved(approvedLock));
  });

  test.each(["trust", "signature"])("rejects dependency %s drift", (field) => {
    const { resolved, approvedLock } = baseline();
    const selection = resolved.selections[0]!;
    const changedSelection =
      field === "trust"
        ? { ...selection, trust: "verified" as const }
        : { ...selection, signature: "changed-publisher-signature" };
    const changed = {
      ...resolved,
      selections: [changedSelection, resolved.selections[1]!],
    };

    expectRejected(changed, withApproved(approvedLock));
  });

  test("rejects generator drift", () => {
    const { resolved, approvedLock } = baseline();
    expectRejected(
      {
        ...resolved,
        generator: { ...resolved.generator, artifactDigest: digest("6".repeat(64)) },
      },
      withApproved(approvedLock),
    );
  });

  test("rejects catalogue snapshot drift", () => {
    const { resolved, approvedLock } = baseline();
    expectRejected(
      { ...resolved, catalogSnapshotDigest: digest("7".repeat(64)) },
      withApproved(approvedLock),
    );
  });

  test.each(["provenance", "signature"])("rejects catalogue authority %s drift", (field) => {
    const { resolved, approvedLock } = baseline();
    const changedAuthority = {
      ...resolved.catalogAuthority,
      ...(field === "provenance" ? { provenance: "fixture://replayed-catalogue" } : {}),
      ...(field === "signature" ? { signature: "replayed-catalogue-signature" } : {}),
    };
    const changed = { ...resolved, catalogAuthority: changedAuthority };

    expectRejected(changed, withApproved(approvedLock));
  });

  test("rejects manifest digest drift", () => {
    const { resolved, approvedLock } = baseline();
    expectRejected(
      { ...resolved, manifestDigest: digest("8".repeat(64)) },
      withApproved(approvedLock),
    );
  });

  test("rejects materialisation-input drift", () => {
    const { resolved, approvedLock } = baseline();
    expectRejected(
      resolved,
      withApproved(approvedLock, { materializationInputsDigest: digest("9".repeat(64)) }),
    );
  });

  test("rejects target-platform drift", () => {
    const { resolved, approvedLock } = baseline();
    expectRejected(resolved, withApproved(approvedLock, { target: { os: "linux", arch: "x64" } }));
  });

  test.each([
    { approvedLock: null },
    { approvedLock: [] },
    { approvedLock: { unexpected: "record" } },
  ])("rejects a malformed approved lock with diagnostics %#", ({ approvedLock }) => {
    const { resolved } = baseline();
    expectRejected(resolved, withApproved(approvedLock as unknown as ConfigurationLock));
  });

  test("rejects an approved lock with an unknown root field", () => {
    const { resolved, approvedLock } = baseline();
    const openLock = { ...approvedLock, ambientGrant: true } as unknown as ConfigurationLock;

    expectRejected(resolved, withApproved(openLock));
  });

  test.each([
    {
      location: "catalogue authority",
      mutate: (lock: ConfigurationLock) => ({
        ...lock,
        catalogAuthority: { ...lock.catalogAuthority, ambientGrant: true },
      }),
    },
    {
      location: "catalogue identity",
      mutate: (lock: ConfigurationLock) => ({
        ...lock,
        catalog: { ...lock.catalog, ambientGrant: true },
      }),
    },
    {
      location: "generator identity",
      mutate: (lock: ConfigurationLock) => ({
        ...lock,
        generator: { ...lock.generator, ambientGrant: true },
      }),
    },
    {
      location: "dependency",
      mutate: (lock: ConfigurationLock) => ({
        ...lock,
        dependencies: [
          { ...lock.dependencies[0]!, ambientGrant: true },
          ...lock.dependencies.slice(1),
        ],
      }),
    },
  ])("rejects an approved lock with an unknown nested field under $location", ({ mutate }) => {
    const { resolved, approvedLock } = baseline();
    expectRejected(resolved, withApproved(mutate(approvedLock) as ConfigurationLock));
  });

  test("rejects an approved lock with a duplicate identical dependency", () => {
    const { resolved, approvedLock } = baseline();
    const duplicate = {
      ...approvedLock,
      dependencies: [...approvedLock.dependencies, approvedLock.dependencies[0]!],
    };

    expectRejected(resolved, withApproved(duplicate));
  });

  test("rejects hostile ConfigurationLockInput without invoking accessors", () => {
    const { resolved } = baseline();
    const valid = createLockInput();
    let reads = 0;
    const hostileRoot = Object.defineProperty(
      { target: valid.target },
      "materializationInputsDigest",
      {
        enumerable: true,
        get: () => {
          reads += 1;
          return valid.materializationInputsDigest;
        },
      },
    );
    const hostileTarget = Object.defineProperty({ arch: valid.target!.arch }, "os", {
      enumerable: true,
      get: () => {
        reads += 1;
        return valid.target!.os;
      },
    });

    expectRejected(resolved, hostileRoot as ConfigurationLockInput);
    expectRejected(resolved, {
      ...valid,
      target: hostileTarget,
    } as unknown as ConfigurationLockInput);
    expect(reads).toBe(0);
  });

  test("rejects a malformed materialisation-input digest with diagnostics", () => {
    const { resolved } = baseline();
    expectRejected(resolved, {
      ...createLockInput(),
      materializationInputsDigest: { algorithm: "md5", value: "short" },
    } as unknown as ConfigurationLockInput);
  });

  test.each([
    { target: null },
    { target: [] },
    { target: { os: "linux" } },
    { target: { os: "linux", arch: "x64", ambientGrant: true } },
  ])("rejects a malformed or open target with diagnostics %#", ({ target }) => {
    const { resolved } = baseline();
    expectRejected(resolved, {
      ...createLockInput(),
      target,
    } as unknown as ConfigurationLockInput);
  });

  test("snapshots mutable ConfigurationLockInput without freezing caller-owned data", () => {
    const { resolved } = baseline();
    const initial = createLockInput();
    const mutable = {
      materializationInputsDigest: { ...initial.materializationInputsDigest },
      target: { ...initial.target! },
    };
    const lock = unwrap(createConfigurationLock(resolved, mutable));

    expect(() => {
      mutable.materializationInputsDigest.value = "a".repeat(64);
      mutable.target.os = "linux";
    }).not.toThrow();
    expect(lock.materializationInputsDigest).toEqual(initial.materializationInputsDigest);
    expect(lock.target).toEqual(initial.target);
    expect(Object.isFrozen(lock)).toBe(true);
  });

  test("rejects a hostile approved lock without invoking accessors", () => {
    const { resolved, approvedLock } = baseline();
    let reads = 0;
    const hostile = Object.defineProperty({ ...approvedLock }, "dependencies", {
      enumerable: true,
      get: () => {
        reads += 1;
        return approvedLock.dependencies;
      },
    }) as ConfigurationLock;

    expectRejected(resolved, withApproved(hostile));
    expect(reads).toBe(0);
  });
});
