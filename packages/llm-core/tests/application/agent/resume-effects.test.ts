import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  contractVersion,
  coreId,
  digest,
  secretRef,
  type InvocationId,
  type StepId,
  type ToolCallId,
} from "#contracts";
import { guardResumeToolExecution } from "../../../src/application/agent/resume-effects";
import type { ExecuteControlledToolInput } from "../../../src/application/tool-execution/public";
import {
  actionDigest,
  bindAction,
  createExecutableTool,
  defineToolDefinition,
  registerToolSchema,
  toolId,
  type ActionDigestPort,
  type ToolCall,
  type ToolSchemaDigestPort,
} from "../../../src/features/tooling/runtime";
import { registerResumableCheckpoint } from "../../../src/features/state/runtime";
import { ACTION_DIGEST, STEP_ONE, STEP_TWO, checkpoint, receipt } from "../../state/helpers";

const schemaDigestPort: ToolSchemaDigestPort = {
  digest: (canonicalSchema) => digest(createHash("sha256").update(canonicalSchema).digest("hex")),
};

const spec = defineToolDefinition({
  id: toolId("billing.invoice.create"),
  version: contractVersion("1.0.0"),
  description: "Create an invoice.",
  inputSchema: await registerToolSchema(
    {
      type: "object",
      additionalProperties: false,
      required: ["amount"],
      properties: { amount: { type: "integer" } },
    },
    schemaDigestPort,
  ),
  effect: {
    class: "external-write",
    targets: [{ kind: "service", id: "billing-api" }],
  },
  execution: {
    concurrency: "exclusive",
    cancellation: "provider-acknowledged",
    idempotency: "required",
    retryAfterStart: "requires-conformance",
  },
});

const call: ToolCall = {
  toolCallId: coreId<ToolCallId>("018f0f4e-8c5b-7a91-8c3b-123456789a20"),
  toolId: spec.id,
  toolVersion: spec.version,
  arguments: { amount: 100 },
  idempotencyKey: "invoice-100",
  invocation: {
    invocationId: coreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789a21"),
    stepId: STEP_TWO,
  },
};

describe("resume effect digest binding", () => {
  test("checks a rotating digest port once and forwards that exact digest", async () => {
    const checkedDigest = actionDigest(
      "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      secretRef("state:test-key"),
    );
    let originalCreateCalls = 0;
    const rotatingDigestPort: ActionDigestPort = {
      create: () => {
        originalCreateCalls += 1;
        return originalCreateCalls === 1 ? checkedDigest : ACTION_DIGEST;
      },
      verify: () => true,
    };
    let downstreamDigest: typeof checkedDigest | undefined;
    const guarded = guardResumeToolExecution(
      {
        async execute(input) {
          const rebound = await bindAction({
            definition: input.tool.definition,
            call: input.call,
            securityDomain: input.securityDomain,
            keyRef: input.digestKeyRef,
            digestPort: input.digestPort,
          });
          downstreamDigest = rebound.digest;
          return {
            status: "conflict",
            existingReceiptId: receipt(STEP_ONE, "completed").receipt.evidenceId,
          };
        },
      },
      registerResumableCheckpoint(
        checkpoint({
          completedStepIds: [STEP_ONE],
          recordedEffects: [receipt(STEP_ONE, "completed")],
        }),
      ),
    );
    const input = {
      tool: createExecutableTool({
        definition: spec,
        argumentValidator: { validate: () => ({ valid: true }) },
        execute: () => ({ toolCallId: call.toolCallId, status: "succeeded", content: [] }),
      }),
      call,
      securityDomain: "tenant:acme",
      digestKeyRef: secretRef("state:test-key"),
      digestPort: rotatingDigestPort,
    } as ExecuteControlledToolInput;

    await guarded.execute(input);

    expect(call.invocation.stepId as StepId).toBe(STEP_TWO);
    expect(originalCreateCalls).toBe(1);
    expect(downstreamDigest).toEqual(checkedDigest);
    expect(downstreamDigest).not.toEqual(ACTION_DIGEST);
  });
});
