import { describe, expect, test } from "bun:test";
import {
  digest,
  newCoreId,
  type InvocationId,
  type ResourceId,
  type RunId,
  type StepId,
} from "#contracts";
import {
  createContextEntry,
  createContextManifest,
  type ContextManifestInput,
} from "../../src/features/context/public";

const invocationId = newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000002100");
const runId = newCoreId<RunId>("0190bd0c-0000-7000-8000-000000002101");
const stepId = newCoreId<StepId>("0190bd0c-0000-7000-8000-000000002102");
const resource = {
  resourceId: newCoreId<ResourceId>("0190bd0c-0000-7000-8000-000000002103"),
  mediaType: "application/json",
  byteLength: 12,
  digest: digest("1".repeat(64)),
};

const input = (): ContextManifestInput => ({
  scope: { kind: "step", invocationId, runId, stepId },
  budget: { maxEntries: 3, maxBytes: 128, maxTokens: 16 },
  entries: [
    {
      source: {
        kind: "content",
        content: [{ kind: "json", value: { z: true, a: "stable" } }],
      },
      provenance: { kind: "supplied", source: "application" },
      priority: "required",
      tokens: 4,
    },
    {
      source: { kind: "resource", resource },
      provenance: { kind: "retrieved", source: resource },
      priority: "preferred",
      tokens: 3,
    },
  ],
});

describe("ContextManifest", () => {
  test("constructs an explicit scoped manifest with computed budget usage", () => {
    const manifest = createContextManifest(input());

    expect(manifest.scope).toEqual({ kind: "step", invocationId, runId, stepId });
    expect(manifest.usage).toEqual({ entries: 2, bytes: 35, tokens: 7 });
    expect(manifest.entries.every((entry) => entry.identity.algorithm === "sha-256")).toBe(true);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.entries[0]?.source)).toBe(true);
  });

  test("derives canonical identities deterministically while preserving entry order", () => {
    const first = createContextManifest(input());
    const reorderedJson = input();
    const contentEntry = reorderedJson.entries[0];
    if (contentEntry?.source.kind !== "content") throw new Error("fixture");
    contentEntry.source.content = [{ kind: "json", value: { a: "stable", z: true } }];

    expect(createContextManifest(reorderedJson).identity).toEqual(first.identity);

    const reorderedEntries = input();
    reorderedEntries.entries.reverse();
    expect(createContextManifest(reorderedEntries).identity).not.toEqual(first.identity);
  });

  test("clones and freezes caller input so later mutation cannot alter identity or provenance", () => {
    const mutable = input();
    const manifest = createContextManifest(mutable);
    const identity = manifest.identity;
    mutable.budget.maxBytes = 999;
    const first = mutable.entries[0];
    if (first?.provenance.kind === "supplied") first.provenance.source = "user";

    expect(manifest.identity).toEqual(identity);
    expect(manifest.budget.maxBytes).toBe(128);
    expect(manifest.entries[0]?.provenance).toEqual({
      kind: "supplied",
      source: "application",
    });
  });

  test("rejects duplicate identities and incomplete token accounting", () => {
    const duplicate = input();
    duplicate.entries = [duplicate.entries[0]!, structuredClone(duplicate.entries[0]!)];
    expect(() => createContextManifest(duplicate)).toThrow("duplicate");

    const missingTokens = input();
    delete missingTokens.entries[1]!.tokens;
    expect(() => createContextManifest(missingTokens)).toThrow("explicit token cost");
  });

  test("fails closed for negative, unsafe, and exceeded budgets", () => {
    const negative = input();
    negative.budget.maxBytes = -1;
    expect(() => createContextManifest(negative)).toThrow("budget");

    const unsafe = input();
    unsafe.budget.maxEntries = Number.MAX_SAFE_INTEGER + 1;
    expect(() => createContextManifest(unsafe)).toThrow("budget");

    const exceeded = input();
    exceeded.budget.maxBytes = 1;
    expect(() => createContextManifest(exceeded)).toThrow("exceeds");
  });

  test("rejects unknown locators, secrets, native values, and cyclic JSON", () => {
    const locator = input();
    locator.entries[1]!.source = {
      kind: "resource",
      resource: { ...resource, url: "https://signed.example/secret" },
    } as never;
    expect(() => createContextManifest(locator)).toThrow("ResourceRef");

    expect(() =>
      createContextEntry({
        source: {
          kind: "content",
          content: [{ kind: "json", value: { credential: new Date() } }],
        } as never,
        provenance: { kind: "supplied", source: "user" },
        priority: "required",
      }),
    ).toThrow("portable content");

    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() =>
      createContextEntry({
        source: {
          kind: "content",
          content: [{ kind: "json", value: cycle }],
        } as never,
        provenance: { kind: "supplied", source: "user" },
        priority: "required",
      }),
    ).toThrow();

    const sparse = new Array(1) as never[];
    expect(() =>
      createContextEntry({
        source: { kind: "content", content: [{ kind: "json", value: sparse }] },
        provenance: { kind: "supplied", source: "user" },
        priority: "required",
      }),
    ).toThrow("portable content");
  });

  test("rejects spoofed derived provenance and malformed scopes", () => {
    const spoofed = input();
    spoofed.entries[0]!.provenance = {
      kind: "derived",
      operation: "summarize",
      sources: [{ algorithm: "sha-256", value: "bad" }],
    } as never;
    expect(() => createContextManifest(spoofed)).toThrow("provenance");

    const source = digest("2".repeat(64));
    spoofed.entries[0]!.provenance = {
      kind: "derived",
      operation: "merge",
      sources: [source, source],
    };
    expect(() => createContextManifest(spoofed)).toThrow("provenance");

    const malformed = input();
    malformed.scope = { kind: "run", invocationId, runId, path: "/private/context" } as never;
    expect(() => createContextManifest(malformed)).toThrow("scope");
  });
});
