import { describe, expect, test } from "bun:test";
import type {
  ConversationId,
  CorrelationId,
  InvocationId,
  PrincipalId,
  RunId,
  SecretId,
  SpanId,
  TenantId,
  TraceFlags,
  TraceId,
} from "../../src/contracts/identity";
import type { InvocationContext } from "../../src/contracts/invocation";

const asId = <T extends string>(value: string) => value as T;

describe("InvocationContext", () => {
  test("round-trips portable identity, authority and guarantee-bearing limits", () => {
    const context: InvocationContext = {
      invocationId: asId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789abc"),
      runId: asId<RunId>("018f0f4e-8c5b-7a91-8c3b-123456789abd"),
      conversationId: asId<ConversationId>("018f0f4e-8c5b-7a91-8c3b-123456789abe"),
      correlationId: asId<CorrelationId>("checkout-42"),
      principal: { principalId: asId<PrincipalId>("user:42") },
      tenant: { tenantId: asId<TenantId>("tenant:acme") },
      trace: {
        traceId: asId<TraceId>("0af7651916cd43dd8448eb211c80319c"),
        spanId: asId<SpanId>("b7ad6b7169203331"),
        traceFlags: asId<TraceFlags>("01"),
      },
      deadlineAt: "2026-07-29T10:30:00.000Z",
      budget: {
        maxModelCalls: 3,
        maxToolCalls: 5,
        maxTotalTokens: 20_000,
        maxDurationMs: 30_000,
        maxCost: { currency: "USD", minorUnits: "250" },
      },
      secretRefs: [{ secretId: asId<SecretId>("vault:providers/openai") }],
    };

    expect(JSON.parse(JSON.stringify(context))).toEqual(context);
  });

  test("exposes only opaque secret references", () => {
    const context: InvocationContext = {
      invocationId: asId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789abc"),
      secretRefs: [{ secretId: asId<SecretId>("vault:model/default") }],
    };

    expect(context.secretRefs?.[0]?.secretId.toString()).toBe("vault:model/default");
    expect(JSON.stringify(context)).not.toContain("secretValue");
  });

  test("has no raw credential or generic extension escape hatch", () => {
    type HasSecretValue = "secretValue" extends keyof InvocationContext ? true : false;
    type HasExtensions = "extensions" extends keyof InvocationContext ? true : false;
    const hasSecretValue: HasSecretValue = false;
    const hasExtensions: HasExtensions = false;

    expect(hasSecretValue).toBe(false);
    expect(hasExtensions).toBe(false);
  });
});
