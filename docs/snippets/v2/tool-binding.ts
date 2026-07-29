import { createHash } from "node:crypto";
import {
  createToolBinding,
  defineToolSpec,
  registerToolSchema,
  toolId,
  type ToolArgumentValidationPort,
} from "@geekist/llm-core/tools";
import { contractVersion, digest } from "@geekist/llm-core/contracts";

const inputSchema = await registerToolSchema(
  {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: { query: { type: "string" } },
  },
  {
    digest: (canonicalSchema) => digest(createHash("sha256").update(canonicalSchema).digest("hex")),
  },
);

const argumentValidator: ToolArgumentValidationPort = {
  validate: ({ arguments: value }) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof value.query === "string"
      ? { valid: true }
      : { valid: false, issues: [{ path: "", code: "schema_mismatch" }] },
};

const spec = defineToolSpec({
  id: toolId("example.search"),
  version: contractVersion("1.0.0"),
  description: "Search the example index.",
  inputSchema,
  effect: { class: "read-only", targets: [] },
  execution: {
    concurrency: "shared",
    cancellation: "cooperative",
    idempotency: "not-supported",
    retryAfterStart: "never",
  },
});

const binding = createToolBinding({
  spec,
  argumentValidator,
  execute: (call) => ({
    toolCallId: call.toolCallId,
    status: "succeeded",
    content: [{ kind: "json", value: { hits: [] } }],
  }),
});

void binding;
