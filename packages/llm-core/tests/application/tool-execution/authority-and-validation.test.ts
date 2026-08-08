import { describe, expect, it } from "bun:test";
import {
  type ActionDigestPort,
  createExecutableTool,
  executeControlledTool,
  type ExecutableTool,
  type ToolCall,
} from "../../../src/tools/runtime";
import { type TenantId, contractVersion, externalId } from "#contracts";
import type { PolicyEvaluationPort } from "../../../src/features/control/runtime";
import {
  allowPolicy,
  CALL_ID,
  call,
  SPEC,
  UUID_V4,
  baseInput,
  digestPort,
  MemoryJournal,
} from "./execute-fixtures";

describe("controlled tool execution", () => {
  it("rejects an unregistered compiled authority before reserving or invoking a tool", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded" as const, content: [] };
    });

    await expect(
      executeControlledTool({
        ...input,
        specification: { compiled: {} as never, authority: {} as never },
      }),
    ).rejects.toThrow("registered compiled specification");
    expect(executions).toBe(0);
    expect(journal.byId.size).toBe(0);
  });

  it("rejects shaped and cloned ExecutableTool forgeries before controlled side effects", async () => {
    const journal = new MemoryJournal();
    let validations = 0;
    let executions = 0;
    let identityMints = 0;
    let policyEvaluations = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded" as const, content: [] };
    });
    const validate = input.tool.validate;
    const forged = {
      ...input.tool,
      validate: (validationInput: Parameters<ExecutableTool["validate"]>[0]) => {
        validations += 1;
        return validate(validationInput);
      },
    } as ExecutableTool;
    const guardedInput = {
      ...input,
      tool: forged,
      facts: {
        ...input.facts,
        newReceiptId: () => {
          identityMints += 1;
          return input.facts.newReceiptId();
        },
      },
      policy: {
        evaluate: (request: Parameters<PolicyEvaluationPort["evaluate"]>[0]) => {
          policyEvaluations += 1;
          return allowPolicy.evaluate(request);
        },
      },
    };

    await expect(executeControlledTool(guardedInput)).rejects.toThrow(
      "Controlled tool execution requires a registered ExecutableTool.",
    );
    expect(validations).toBe(0);
    expect(executions).toBe(0);
    expect(identityMints).toBe(0);
    expect(policyEvaluations).toBe(0);
    expect(journal.byId.size).toBe(0);
  });

  it("rejects UUIDv4 values from receipt, event, and policy identity ports", async () => {
    const execute = () => ({ toolCallId: CALL_ID, status: "succeeded" as const, content: [] });

    for (const [factory, label] of [
      ["newReceiptId", "Tool receipt"],
      ["newEventId", "Tool execution event"],
      ["newPolicyEvaluationId", "Tool policy evaluation"],
    ] as const) {
      const input = baseInput(new MemoryJournal(), execute);
      input.facts = {
        ...input.facts,
        [factory]: () => UUID_V4 as never,
      };
      await expect(executeControlledTool(input)).rejects.toThrow(
        `${label} identity ports must mint canonical UUIDv7 IDs`,
      );
    }
  });

  it("rejects UUIDv4 values from approval and cancellation identity ports", async () => {
    const approvalInput = baseInput(new MemoryJournal(), () => ({
      toolCallId: CALL_ID,
      status: "succeeded",
      content: [],
    }));
    approvalInput.facts = {
      ...approvalInput.facts,
      newApprovalId: () => UUID_V4 as never,
    };
    approvalInput.policy = {
      evaluate: ({ evaluation }) => ({
        evaluation,
        policyId: "example.tool-policy",
        policyVersion: contractVersion("1.0.0"),
        decidedAt: "2026-07-29T00:00:00.000Z",
        decision: "require-approval",
      }),
    };
    await expect(executeControlledTool(approvalInput)).rejects.toThrow(
      "Tool approval identity ports must mint canonical UUIDv7 IDs",
    );

    const cancellationInput = baseInput(new MemoryJournal(), () => ({
      toolCallId: CALL_ID,
      status: "succeeded",
      content: [],
    }));
    cancellationInput.facts = {
      ...cancellationInput.facts,
      newCancellationId: () => UUID_V4 as never,
    };
    await expect(
      executeControlledTool({
        ...cancellationInput,
        executionControl: {
          isCancellationRequested: () => true,
          onCancellationRequested: () => () => undefined,
        },
      }),
    ).rejects.toThrow("Tool cancellation identity ports must mint canonical UUIDv7 IDs");
  });

  it("validates arguments before reserving or authorizing an action", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });
    const binding = createExecutableTool({
      definition: SPEC,
      argumentValidator: {
        validate: () => ({
          valid: false,
          issues: [{ path: "/amount", code: "not-an-integer" }],
        }),
      },
      execute: input.tool.execute,
    });

    await expect(executeControlledTool({ ...input, tool: binding })).rejects.toThrow(
      "Tool arguments do not satisfy the registered input schema.",
    );
    expect(journal.byId.size).toBe(0);
    expect(executions).toBe(0);
  });

  it("validates exactly once and executes the immutable call bound into the action digest", async () => {
    const journal = new MemoryJournal();
    const originalCall = call();
    let validations = 0;
    let executedCall: ToolCall | undefined;
    let canonicalDocument: string | undefined;
    const binding = createExecutableTool({
      definition: SPEC,
      argumentValidator: {
        validate: () => {
          validations += 1;
          return validations === 1
            ? { valid: true }
            : {
                valid: false,
                issues: [{ path: "", code: "validator-reentered" }],
              };
        },
      },
      execute: ({ call: validatedCall }) => {
        executedCall = validatedCall;
        return { toolCallId: validatedCall.toolCallId, status: "succeeded", content: [] };
      },
    });
    const capturingDigestPort: ActionDigestPort = {
      create: (material) => {
        canonicalDocument = material.canonicalDocument;
        return digestPort.create(material);
      },
      verify: digestPort.verify,
    };
    const input = {
      ...baseInput(journal, () => ({
        toolCallId: CALL_ID,
        status: "succeeded" as const,
        content: [],
      })),
      tool: binding,
      call: originalCall,
      digestPort: capturingDigestPort,
      concurrency: {
        acquire: async (
          request: Parameters<ReturnType<typeof baseInput>["concurrency"]["acquire"]>[0],
        ) => {
          (originalCall.arguments as { amount: number }).amount = 999;
          originalCall.invocation.tenant!.tenantId = externalId<TenantId>("tenant:mutated");
          return { request, release: () => undefined };
        },
      },
    };

    const outcome = await executeControlledTool(input);

    expect(outcome.status).toBe("succeeded");
    expect(validations).toBe(1);
    expect(executedCall?.arguments).toEqual({ amount: 100 });
    expect(executedCall?.invocation.tenant?.tenantId).toBe(externalId<TenantId>("tenant:acme"));
    expect(Object.isFrozen(executedCall)).toBe(true);
    expect(Object.isFrozen(executedCall?.arguments)).toBe(true);
    expect(Object.isFrozen(executedCall?.invocation)).toBe(true);
    expect(JSON.parse(canonicalDocument!).arguments).toEqual({ amount: 100 });
  });
});
