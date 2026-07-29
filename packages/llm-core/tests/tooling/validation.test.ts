import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { contractVersion, coreId, digest, type InvocationId, type ToolCallId } from "#contracts";
import {
  ToolArgumentValidationError,
  createToolBinding,
  defineToolSpec,
  registerToolSchema,
  toolId,
  validateToolArguments,
  type ToolArgumentValidationPort,
} from "../../src/features/tooling/public";

const schemaDigestPort = {
  digest: (canonicalSchema: string) =>
    digest(createHash("sha256").update(canonicalSchema).digest("hex")),
};

const strictCountValidator: ToolArgumentValidationPort = {
  validate: ({ arguments: value }) => {
    const record =
      typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
    const valid =
      record !== null && Object.keys(record).length === 1 && Number.isInteger(record.count);
    return valid
      ? { valid: true }
      : {
          valid: false,
          issues: [{ path: "", code: "schema_mismatch" }],
        };
  },
};

describe("strict tool argument validation", () => {
  test("returns the exact normalized input rather than validator replacement data", async () => {
    const schema = await registerToolSchema(
      {
        type: "object",
        additionalProperties: false,
        required: ["count"],
        properties: { count: { type: "integer" } },
      },
      schemaDigestPort,
    );

    expect(await validateToolArguments(schema, { count: 2 }, strictCountValidator)).toEqual({
      count: 2,
    });
  });

  test("rejects coercible and unknown-field arguments instead of changing them", async () => {
    const schema = await registerToolSchema(
      {
        type: "object",
        additionalProperties: false,
        required: ["count"],
        properties: { count: { type: "integer" } },
      },
      schemaDigestPort,
    );

    expect(() => validateToolArguments(schema, { count: "2" }, strictCountValidator)).toThrow(
      ToolArgumentValidationError,
    );
    expect(() =>
      validateToolArguments(schema, { count: 2, unknown: true }, strictCountValidator),
    ).toThrow(ToolArgumentValidationError);
  });

  test("binding rejects invalid arguments before invoking the executor", async () => {
    const schema = await registerToolSchema(
      {
        type: "object",
        additionalProperties: false,
        required: ["count"],
        properties: { count: { type: "integer" } },
      },
      schemaDigestPort,
    );
    const spec = defineToolSpec({
      id: toolId("math.count.read"),
      version: contractVersion("1.0.0"),
      description: "Read count",
      inputSchema: schema,
      effect: { class: "read-only", targets: [] },
      execution: {
        concurrency: "shared",
        cancellation: "cooperative",
        idempotency: "not-supported",
        retryAfterStart: "never",
      },
    });
    let executions = 0;
    let receivedCancellation = false;
    const binding = createToolBinding({
      spec,
      argumentValidator: strictCountValidator,
      execute: (call, control) => {
        executions += 1;
        receivedCancellation = control?.isCancellationRequested() ?? false;
        return {
          toolCallId: call.toolCallId,
          status: "succeeded",
          content: [{ kind: "json", value: call.arguments }],
        };
      },
    });
    const call = {
      toolCallId: coreId<ToolCallId>("018f0c7a-4d2b-7abc-8def-0123456789ab"),
      toolId: spec.id,
      toolVersion: spec.version,
      arguments: { count: "2" },
      invocation: {
        invocationId: coreId<InvocationId>("018f0c7a-4d2b-7abc-8def-1123456789ab"),
      },
    };

    expect(() => binding.validate(call)).toThrow(ToolArgumentValidationError);
    expect(() => binding.execute(call)).toThrow(ToolArgumentValidationError);
    expect(executions).toBe(0);

    const validCall = { ...call, arguments: { count: 2 } };
    expect((await binding.validate(validCall)).arguments).toEqual({ count: 2 });
    expect(executions).toBe(0);

    await binding.execute(validCall, {
      isCancellationRequested: () => true,
      onCancellationRequested: () => () => undefined,
    });
    expect(executions).toBe(1);
    expect(receivedCancellation).toBe(true);
  });
});
