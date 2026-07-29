import { createHash, createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  contractVersion,
  coreId,
  digest,
  externalId,
  secretRef,
  type InvocationId,
  type PrincipalId,
  type TenantId,
  type ToolCallId,
} from "#contracts";
import {
  actionDigest,
  bindAction,
  createActionDocument,
  defineToolSpec,
  registerToolSchema,
  toolId,
  verifyActionDigest,
  type ActionDigestPort,
  type ToolCall,
  type ToolSchemaDigestPort,
  type ToolSpec,
} from "../../src/features/tooling/public";

const schemaDigestPort: ToolSchemaDigestPort = {
  digest: (canonicalSchema) => digest(createHash("sha256").update(canonicalSchema).digest("hex")),
};

const hmacKey = "test-only-key";
const createTestActionDigest = (
  canonicalDocument: string,
  securityDomain: string,
  keyRef: ReturnType<typeof secretRef>,
) =>
  actionDigest(
    createHmac("sha256", hmacKey)
      .update(securityDomain)
      .update("\0")
      .update(canonicalDocument)
      .digest("base64url"),
    keyRef,
  );

const digestPort: ActionDigestPort = {
  create: ({ canonicalDocument, securityDomain, keyRef }) =>
    createTestActionDigest(canonicalDocument, securityDomain, keyRef),
  verify: ({ canonicalDocument, securityDomain, keyRef, digest: expected }) => {
    const actual = createTestActionDigest(canonicalDocument, securityDomain, keyRef);
    return actual.value === expected.value && actual.keyRef.secretId === expected.keyRef.secretId;
  },
};

const createSpec = async (
  schemaDocument: Record<string, unknown>,
  concurrency: "shared" | "exclusive" = "exclusive",
): Promise<ToolSpec> =>
  defineToolSpec({
    id: toolId("billing.invoice.create"),
    version: contractVersion("1.0.0"),
    description: "Create an invoice",
    inputSchema: await registerToolSchema(schemaDocument, schemaDigestPort),
    effect: {
      class: "external-write",
      targets: [
        { kind: "service", id: "billing-api" },
        { kind: "tenant", id: "tenant:acme" },
      ],
    },
    execution: {
      concurrency,
      cancellation: "provider-acknowledged",
      idempotency: "required",
      retryAfterStart: "requires-conformance",
    },
  });

const createCall = (argumentsValue: ToolCall["arguments"]): ToolCall => ({
  toolCallId: coreId<ToolCallId>("018f0c7a-4d2b-7abc-8def-0123456789ab"),
  toolId: toolId("billing.invoice.create"),
  toolVersion: contractVersion("1.0.0"),
  arguments: argumentsValue,
  idempotencyKey: "invoice-42",
  invocation: {
    invocationId: coreId<InvocationId>("018f0c7a-4d2b-7abc-8def-1123456789ab"),
    tenant: { tenantId: externalId<TenantId>("tenant:acme") },
    principal: { principalId: externalId<PrincipalId>("user:42") },
  },
});

const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["amount"],
  properties: { amount: { type: "integer", minimum: 0 } },
};

describe("canonical tool actions", () => {
  test("changed arguments change the canonical document and digest input", async () => {
    const spec = await createSpec(inputSchema);
    const keyRef = secretRef("vault:action-signing/current");
    const first = await bindAction({
      spec,
      call: createCall({ amount: 100 }),
      securityDomain: "tenant:acme",
      keyRef,
      digestPort,
    });
    const changed = await bindAction({
      spec,
      call: createCall({ amount: 101 }),
      securityDomain: "tenant:acme",
      keyRef,
      digestPort,
    });

    expect(first.canonicalDocument).not.toBe(changed.canonicalDocument);
    expect(first.digest.value).not.toBe(changed.digest.value);
  });

  test("schema changes alter the canonical action binding", async () => {
    const integerSpec = await createSpec(inputSchema);
    const numberSpec = await createSpec({
      ...inputSchema,
      properties: { amount: { type: "number", minimum: 0 } },
    });
    const call = createCall({ amount: 100 });

    const integerAction = createActionDocument(integerSpec, call);
    const numberAction = createActionDocument(numberSpec, call);

    expect(integerAction.tool.inputSchemaDigest).not.toEqual(numberAction.tool.inputSchemaDigest);
  });

  test("binds authority, effects and explicit exclusive semantics but excludes lifecycle fields", async () => {
    const spec = await createSpec(inputSchema, "exclusive");
    const call = createCall({ amount: 100 });
    const document = createActionDocument(spec, call);
    const serialized = JSON.stringify(document);

    expect(document.execution.concurrency).toBe("exclusive");
    expect(JSON.parse(JSON.stringify(document.authority))).toEqual({
      tenantId: "tenant:acme",
      principalId: "user:42",
    });
    expect(document.effect.targets).toEqual([
      { kind: "service", id: "billing-api" },
      { kind: "tenant", id: "tenant:acme" },
    ]);
    expect(serialized).not.toContain("toolCallId");
    expect(serialized).not.toContain("invocationId");
    expect(serialized).not.toContain("idempotencyKey");
  });

  test("verifies only the exact canonical action under the security domain and key", async () => {
    const spec = await createSpec(inputSchema);
    const call = createCall({ amount: 100 });
    const keyRef = secretRef("vault:action-signing/current");
    const bound = await bindAction({
      spec,
      call,
      securityDomain: "tenant:acme",
      keyRef,
      digestPort,
    });

    expect(
      await verifyActionDigest({
        spec,
        call,
        securityDomain: "tenant:acme",
        keyRef,
        digest: bound.digest,
        digestPort,
      }),
    ).toBe(true);
    expect(
      await verifyActionDigest({
        spec,
        call: createCall({ amount: 101 }),
        securityDomain: "tenant:acme",
        keyRef,
        digest: bound.digest,
        digestPort,
      }),
    ).toBe(false);
  });

  test("rejects meaningful effects without targets and mismatched calls", async () => {
    const spec = await createSpec(inputSchema);
    expect(() =>
      defineToolSpec({
        ...spec,
        effect: { class: "destructive", targets: [] },
      }),
    ).toThrow(TypeError);
    expect(() =>
      createActionDocument(spec, {
        ...createCall({ amount: 100 }),
        toolId: toolId("billing.invoice.cancel"),
      }),
    ).toThrow(TypeError);
  });
});
