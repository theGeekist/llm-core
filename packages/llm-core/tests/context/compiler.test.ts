import { describe, expect, test } from "bun:test";
import {
  digest,
  externalId,
  newCoreId,
  type EvidenceId,
  type InvocationId,
  type ResourceId,
  type TenantId,
} from "#contracts";
import {
  createContextCompiler,
  type ContextCandidate,
  type ContextCompilerInput,
} from "../../src/features/context/public";

const invocationId = newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000002200");
const tenantA = externalId<TenantId>("tenant-a");
const tenantB = externalId<TenantId>("tenant-b");
const resource = {
  resourceId: newCoreId<ResourceId>("0190bd0c-0000-7000-8000-000000002201"),
  mediaType: "application/json",
  byteLength: 1,
  digest: digest("1".repeat(64)),
};

const evidence = {
  evidenceId: newCoreId<EvidenceId>("0190bd0c-0000-7000-8000-000000002202"),
  kind: "other" as const,
  content: resource,
};

const candidate = (
  text: string,
  overrides: Partial<ContextCandidate["eligibility"]> = {},
): ContextCandidate => ({
  entry: {
    source: { kind: "content", content: [{ kind: "text", text }] },
    provenance: { kind: "supplied", source: "application" },
    priority: "preferred",
    tokens: 1,
  },
  eligibility: {
    sourceAuthorization: "authorized",
    tenantIds: [],
    purposes: ["chat"],
    classification: "public",
    freshUntil: "2026-08-01T01:00:00.000Z",
    promptInjectionTreatment: "allow",
    precedence: 0,
    evidence: [evidence],
    ...overrides,
  },
});

const input = (candidates: ContextCandidate[]): ContextCompilerInput => ({
  scope: { kind: "invocation", invocationId },
  tenantId: tenantA,
  purpose: "chat",
  asOf: "2026-08-01T00:00:00.000Z",
  maxClassification: "restricted",
  budget: { maxEntries: 3, maxBytes: 128, maxTokens: 8 },
  candidates,
});

describe("ContextCompiler", () => {
  test("keeps every denied eligibility disposition as evidence without selecting it", () => {
    const deniedInput = input([
      candidate("denied", { sourceAuthorization: "denied" }),
      candidate("tenant", { tenantIds: [tenantB] }),
      candidate("purpose", { purposes: ["export"] }),
      candidate("stale", { freshUntil: "2026-08-01T00:00:00.000Z" }),
      candidate("classified", { classification: "restricted" }),
      candidate("unsafe", { promptInjectionTreatment: "deny" }),
    ]);
    deniedInput.maxClassification = "internal";
    const result = createContextCompiler().compile(deniedInput);

    expect(result.selection.entries).toEqual([]);
    expect(result.evidence.map(({ disposition, reasons }) => ({ disposition, reasons }))).toEqual([
      { disposition: "excluded", reasons: ["source-authorization"] },
      { disposition: "excluded", reasons: ["tenant"] },
      { disposition: "excluded", reasons: ["purpose"] },
      { disposition: "excluded", reasons: ["freshness"] },
      { disposition: "excluded", reasons: ["classification"] },
      { disposition: "excluded", reasons: ["prompt-injection-risk"] },
    ]);
  });

  test("uses only the supplied redacted replacement and retains the original provenance", () => {
    const raw = candidate("untrusted source", {
      promptInjectionTreatment: "redact",
      redacted: {
        source: { kind: "content", content: [{ kind: "text", text: "sanitized" }] },
        provenance: { kind: "supplied", source: "application" },
        priority: "preferred",
        tokens: 1,
      },
    });
    const result = createContextCompiler().compile(input([raw]));

    expect(result.selection.entries[0]?.source).toEqual({
      kind: "content",
      content: [{ kind: "text", text: "sanitized" }],
    });
    expect(result.evidence[0]).toMatchObject({ disposition: "redacted", reasons: ["redaction"] });
    expect(JSON.stringify(result.evidence)).not.toContain("untrusted source");
  });

  test("allocates deterministically by priority and precedence and records budget overflow", () => {
    const requiredLater = candidate("required-later", { precedence: 9 });
    requiredLater.entry.priority = "required";
    const requiredFirst = candidate("required-first", { precedence: 1 });
    requiredFirst.entry.priority = "required";
    const optional = candidate("optional", { precedence: 0 });
    optional.entry.priority = "optional";
    const compileInput = input([optional, requiredLater, requiredFirst]);
    compileInput.budget.maxEntries = 2;

    const result = createContextCompiler().compile(compileInput);

    expect(result.selection.entries.map((entry) => entry.source)).toEqual([
      { kind: "content", content: [{ kind: "text", text: "required-first" }] },
      { kind: "content", content: [{ kind: "text", text: "required-later" }] },
    ]);
    expect(result.evidence[0]).toMatchObject({ disposition: "excluded", reasons: ["budget"] });
  });

  test("fails closed for missing token costs and hostile candidate shapes", () => {
    const missingTokens = candidate("unknown cost");
    delete missingTokens.entry.tokens;
    const result = createContextCompiler().compile(input([missingTokens]));
    expect(result.selection.entries).toEqual([]);
    expect(result.evidence[0]).toMatchObject({
      disposition: "excluded",
      reasons: ["missing-token-cost"],
    });

    let reads = 0;
    const hostile = { entry: candidate("safe").entry } as Record<string, unknown>;
    Object.defineProperty(hostile, "eligibility", {
      enumerable: true,
      get: () => {
        reads += 1;
        return candidate("must-not-run").eligibility;
      },
    });
    expect(() =>
      createContextCompiler().compile(input([hostile as unknown as ContextCandidate])),
    ).toThrow("candidates");
    expect(reads).toBe(0);

    const nestedAccessor = candidate("nested") as unknown as {
      eligibility: Record<string, unknown>;
    };
    Object.defineProperty(nestedAccessor.eligibility, "tenantIds", {
      enumerable: true,
      get: () => {
        reads += 1;
        return [];
      },
    });
    expect(() =>
      createContextCompiler().compile(input([nestedAccessor as unknown as ContextCandidate])),
    ).toThrow("eligibility");
    expect(reads).toBe(0);

    expect(() =>
      createContextCompiler().compile(input([candidate("bad-time", { freshUntil: "tomorrow" })])),
    ).toThrow("eligibility");

    expect(() =>
      createContextCompiler().compile(
        input([
          candidate("bad-redaction", {
            promptInjectionTreatment: "redact",
            redacted: {
              source: { kind: "content", content: [{ kind: "text", text: "sanitized" }] },
              provenance: { kind: "supplied", source: "user" },
              priority: "preferred",
              tokens: 1,
            },
          }),
        ]),
      ),
    ).toThrow("preserve");
  });

  test("never includes two candidates that resolve to the same context identity", () => {
    const result = createContextCompiler().compile(input([candidate("same"), candidate("same")]));

    expect(result.selection.entries).toHaveLength(1);
    expect(result.evidence[1]).toMatchObject({ disposition: "excluded", reasons: ["duplicate"] });
  });

  test("detaches all selection and eligibility evidence from caller mutation", () => {
    const mutable = input([candidate("stable")]);
    const result = createContextCompiler().compile(mutable);
    mutable.candidates[0]!.entry.source = {
      kind: "content",
      content: [{ kind: "text", text: "changed" }],
    };
    mutable.candidates[0]!.eligibility.purposes[0] = "changed";

    expect(result.selection.entries[0]?.source).toEqual({
      kind: "content",
      content: [{ kind: "text", text: "stable" }],
    });
    expect(result.evidence[0]?.eligibility.purposes).toEqual(["chat"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.selection).not.toHaveProperty("authorization");
  });
});
