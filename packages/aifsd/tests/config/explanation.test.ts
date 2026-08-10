import { describe, expect, test } from "bun:test";
import { digest } from "@geekist/llm-core/contracts";

import {
  explainConfiguration,
  planChanges,
  resolveManifest,
  type ConfigurationResult,
  type MaybePromise,
} from "../../src/config/index.js";
import {
  admitCatalog,
  createCatalog,
  createLockFixture,
  createManifest,
  generator,
} from "./fixtures/configuration.js";

const unwrap = <T>(result: ConfigurationResult<T>): T => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected success, received ${JSON.stringify(result.diagnostics)}`);
  }
  return result.value;
};

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

const oldDigest = digest("4".repeat(64));

describe("configuration explanation facts", () => {
  test("exposes immutable recorded resolution decisions without invented prose", () => {
    const catalog = createCatalog();
    const resolved = unwrap(
      synchronous(
        resolveManifest(createManifest(), catalog, {
          generator,
          catalogAdmission: admitCatalog(catalog),
        }),
      ),
    );

    const decisions = explainConfiguration(resolved);

    expect(decisions).toEqual(resolved.resolutionDecisions);
    expect(decisions[0]).toEqual(
      expect.objectContaining({
        kind: "selection-resolution",
        selectionReasonCode: "manifest-selection",
        versionReasonCode: "highest-compatible-release",
        selectedVersion: "1.2.0",
      }),
    );
    expect(Object.isFrozen(decisions)).toBe(true);
    expect(Object.isFrozen(decisions[0]!)).toBe(true);
    expect(
      decisions.every((decision) => !("message" in decision) && !("summary" in decision)),
    ).toBe(true);
  });

  test("exposes immutable planned-change facts without artifact content", () => {
    const plan = planChanges({
      lock: createLockFixture(),
      desired: [
        {
          path: "generated/native.mjs",
          ownership: "aifsd-owned",
          content: "export const native = true;\n",
        },
      ],
      workspace: {
        artifacts: [
          {
            path: "generated/native.mjs",
            ownership: "aifsd-owned",
            contentDigest: oldDigest,
          },
        ],
      },
    });

    const decisions = explainConfiguration(plan);

    expect(decisions).toEqual([
      expect.objectContaining({
        kind: "planned-change",
        path: "generated/native.mjs",
        change: "update-owned-region",
        ownership: "aifsd-owned",
        reasonCode: "aifsd-owned-content-stale",
        expectedCurrentDigest: oldDigest,
      }),
    ]);
    expect(
      decisions.every((decision) => !("content" in decision) && !("message" in decision)),
    ).toBe(true);
    expect(Object.isFrozen(decisions)).toBe(true);
    expect(Object.isFrozen(decisions[0]!)).toBe(true);
  });
});
