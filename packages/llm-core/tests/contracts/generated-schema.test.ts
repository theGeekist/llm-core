import { describe, expect, test } from "bun:test";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

type JsonSchema = {
  $id: string;
  definitions?: Record<string, unknown>;
};

const schema = (await Bun.file(
  new URL("../../src/contracts/generated/contracts.schema.json", import.meta.url),
).json()) as JsonSchema;

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
});
addFormats(ajv);
ajv.addSchema(schema);

const definition = (name: string): ValidateFunction =>
  ajv.compile({ $ref: `${schema.$id}#/definitions/${name}` });

const UUID_V7 = "018f0f4e-8c5b-7a91-8c3b-123456789abc";

describe("generated contract schema", () => {
  test("compiles under an independent Draft 7 validator", () => {
    expect(Object.keys(schema.definitions ?? {}).length).toBeGreaterThan(0);
    expect(definition("ContractSchemaRoots")).toBeDefined();
  });

  test("enforces invocation portability, limits and secret-reference-only shape", () => {
    const validate = definition("InvocationContext");
    const valid = {
      invocationId: UUID_V7,
      deadlineAt: "2026-07-29T10:30:00.000Z",
      budget: {
        maxModelCalls: 3,
        maxDurationMs: 30_000,
        maxCost: { currency: "USD", minorUnits: "250" },
      },
      secretRefs: [{ secretId: "vault:model/default" }],
    };

    expect(validate(valid)).toBe(true);
    expect(validate({ ...valid, budget: { maxModelCalls: -1 } })).toBe(false);
    expect(validate({ ...valid, budget: { maxModelCalls: 1.5 } })).toBe(false);
    expect(validate({ ...valid, deadlineAt: "tomorrow" })).toBe(false);
    expect(validate({ ...valid, secretValue: "sk-raw-secret" })).toBe(false);
    expect(
      validate({
        ...valid,
        extensions: { "com.example.credentials": { apiKey: "sk-raw-secret" } },
      }),
    ).toBe(false);
  });

  test("enforces reverse-DNS native extension keys", () => {
    const validate = definition("NativeExtensions");

    expect(validate({ "com.openai.responses": { responseId: "resp_123" } })).toBe(true);
    expect(validate({ "OpenAI.responses": { responseId: "resp_123" } })).toBe(false);
    expect(validate({ provider: { responseId: "resp_123" } })).toBe(false);
  });

  test("enforces evidence-backed, non-empty capability bindings", () => {
    const validate = definition("CapabilityBinding");
    const passingEvidence = {
      report: {
        evidenceId: UUID_V7,
        kind: "evaluation",
        content: {
          resourceId: "018f0f4e-8c5b-7a91-8c3b-123456789abd",
          mediaType: "application/json",
          byteLength: 42,
          digest: { algorithm: "sha-256", value: "a".repeat(64) },
        },
      },
      suiteId: "llm-core.model-content",
      suiteVersion: "1.2.0",
      observedAt: "2026-07-29T10:30:00.000Z",
      implementationId: "builtin:model",
      implementationVersion: "1.0.0",
      result: "pass",
    };
    const valid = {
      bindingId: "builtin:model",
      claims: [
        {
          capabilityId: "llm-core.model.streaming",
          version: "1.0.0",
          status: "supported",
          evidence: passingEvidence,
        },
      ],
    };

    expect(validate(valid)).toBe(true);
    expect(validate({ ...valid, claims: [] })).toBe(false);
    expect(
      validate({
        ...valid,
        claims: [
          {
            ...valid.claims[0],
            evidence: {
              ...passingEvidence,
              result: "fail",
              failures: [{ name: "streaming", value: false }],
            },
          },
        ],
      }),
    ).toBe(false);
  });

  test("publishes every accepted portable identity definition", () => {
    for (const name of ["DurableJobId", "EventId", "ExtensionNamespace", "ProviderSessionId"]) {
      expect(schema.definitions?.[name]).toBeDefined();
      expect(definition(name)).toBeDefined();
    }
  });
});
