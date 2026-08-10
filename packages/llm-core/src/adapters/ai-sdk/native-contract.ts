import type { ContentPart, GeneratedFile, StepResult, TextStreamPart, ToolSet } from "ai";
import type { JsonValue } from "#contracts";
import {
  cloneFrozenAiSdk7Json,
  snapshotAiSdk7GeneratedFile,
  snapshotAiSdk7Known,
  snapshotAiSdk7Part,
  snapshotAiSdk7Step,
} from "./native-snapshot";
import type {
  AiSdk7NativeContract,
  AiSdk7NativeEvent,
  AiSdk7NativeEventKind,
  AiSdk7NativeOperation,
} from "./provider-types";

export const AI_SDK7_AUTHORITY = Object.freeze({ ai: "7.0.37", provider: "4.0.3" });

const operationRows = [
  ["generateText.content", "supported", "ai@7.0.37", "native content events"],
  ["generateText.text", "supported", "ai@7.0.37", "content-derived"],
  ["generateText.reasoning", "supported", "ai@7.0.37", "content-derived"],
  ["generateText.reasoningText", "supported", "ai@7.0.37", "content-derived"],
  ["generateText.files", "supported", "ai@7.0.37", "generated-file events"],
  ["generateText.sources", "supported", "ai@7.0.37", "source events"],
  ["generateText.toolCalls", "supported", "ai@7.0.37", "content-derived"],
  ["generateText.staticToolCalls", "supported", "ai@7.0.37", "content-derived"],
  ["generateText.dynamicToolCalls", "supported", "ai@7.0.37", "content-derived"],
  ["generateText.toolResults", "supported", "ai@7.0.37", "content-derived"],
  ["generateText.staticToolResults", "supported", "ai@7.0.37", "content-derived"],
  ["generateText.dynamicToolResults", "supported", "ai@7.0.37", "content-derived"],
  ["generateText.finishReason", "supported", "ai@7.0.37", "generate-result event"],
  ["generateText.rawFinishReason", "supported", "ai@7.0.37", "generate-result event"],
  ["generateText.usage", "supported", "ai@7.0.37", "generate-result event"],
  ["generateText.totalUsage", "supported", "ai@7.0.37", "generate-result event"],
  ["generateText.warnings", "supported", "@ai-sdk/provider@4.0.3", "warning events"],
  ["generateText.request", "supported", "ai@7.0.37", "generate-result event"],
  ["generateText.response", "supported", "ai@7.0.37", "response-metadata event"],
  ["generateText.responseMessages", "supported", "ai@7.0.37", "generate-result event"],
  [
    "generateText.providerMetadata",
    "supported",
    "@ai-sdk/provider@4.0.3",
    "provider-metadata event",
  ],
  ["generateText.steps", "supported", "ai@7.0.37", "step events"],
  ["generateText.finalStep", "supported", "ai@7.0.37", "final-step event"],
  ["generateText.output", "supported", "ai@7.0.37", "structured-output event"],
  ["generateText.steps.model", "unsupported", "ai@7.0.37", "executable provider handle"],
  ["generateText.steps.runtimeContext", "unsupported", "ai@7.0.37", "execution-only context"],
  ["generateText.steps.toolsContext", "unsupported", "ai@7.0.37", "execution-only context"],
  ["streamText.parts", "supported", "ai@7.0.37", "ordered stream events"],
  ["errors.apiCall", "supported", "@ai-sdk/provider@4.0.3", "closed APICallError snapshot"],
  ["errors.abort", "supported", "ai@7.0.37", "closed DOMException snapshot"],
  ["errors.closed", "supported", "ai@7.0.37", "closed Error or JSON snapshot"],
  ["errors.otherAiSdk", "unsupported", "@ai-sdk/provider@4.0.3", "unregistered error family"],
  ["errors.stack", "unsupported", "ai@7.0.37", "diagnostic stack is not a response contract"],
  ["streamText.raw", "unsupported", "ai@7.0.37", "includeRawChunks is never requested"],
  ["tools.providerExecution", "unsupported", "ai@7.0.37", "adapter tools have no executor"],
] as const;

export const AI_SDK7_OPERATION_DISPOSITIONS = Object.freeze(
  operationRows.map(([operation, disposition, authority, projection]) =>
    Object.freeze({ operation, disposition, authority, projection }),
  ),
);

const eventKind = (type: string): AiSdk7NativeEventKind => {
  if (type === "error" || type === "tool-error") return "error";
  if (type === "tool-approval-request" || type === "tool-approval-response") return "approval";
  if (type === "file" || type === "reasoning-file") return "generated-file";
  if (type === "source") return "source";
  return "content";
};

export const emitAiSdk7NativeEvent = async (input: {
  contract: AiSdk7NativeContract;
  operation: AiSdk7NativeOperation;
  kind: AiSdk7NativeEventKind;
  path: string;
  value: unknown;
  knownShape?: boolean;
}): Promise<JsonValue> => {
  const candidate = cloneFrozenAiSdk7Json(
    input.knownShape ? snapshotAiSdk7Known(input.value, input.path) : input.value,
    `${input.path}.candidate`,
  );
  const redacted = await input.contract.redact(
    Object.freeze({
      authority: AI_SDK7_AUTHORITY,
      operation: input.operation,
      kind: input.kind,
      path: input.path,
      value: candidate,
    }),
  );
  if (redacted === undefined)
    throw new TypeError(`AI SDK native redaction rejected ${input.path}.`);
  const safe = cloneFrozenAiSdk7Json(redacted, `${input.path}.redacted`);
  const observedValue = cloneFrozenAiSdk7Json(safe, `${input.path}.observed`);
  const returnedValue = cloneFrozenAiSdk7Json(safe, `${input.path}.returned`);
  const event: AiSdk7NativeEvent = Object.freeze({
    namespace: "dev.ai-sdk",
    authority: AI_SDK7_AUTHORITY,
    operation: input.operation,
    kind: input.kind,
    path: input.path,
    value: observedValue,
  });
  await input.contract.observe(event);
  return returnedValue;
};

export const emitAiSdk7CompletionPart = (
  contract: AiSdk7NativeContract,
  part: ContentPart<ToolSet>,
  index: number,
) => {
  const path = `content[${index}]`;
  const nativePart = snapshotAiSdk7Part(part, path);
  return emitAiSdk7NativeEvent({
    contract,
    operation: "generateText",
    kind: eventKind(nativePart.kind),
    path,
    value: nativePart.value,
  });
};

export const emitAiSdk7StreamPart = (
  contract: AiSdk7NativeContract,
  part: TextStreamPart<ToolSet>,
  index: number,
) => {
  const path = `stream[${index}]`;
  const nativePart = snapshotAiSdk7Part(part, path);
  return emitAiSdk7NativeEvent({
    contract,
    operation: "streamText",
    kind: eventKind(nativePart.kind),
    path,
    value: nativePart.value,
  });
};

export const emitAiSdk7GeneratedFile = (
  contract: AiSdk7NativeContract,
  file: GeneratedFile,
  index: number,
) =>
  emitAiSdk7NativeEvent({
    contract,
    operation: "generateText",
    kind: "generated-file",
    path: `files[${index}]`,
    value: snapshotAiSdk7GeneratedFile(file, `files[${index}]`),
  });

export const emitAiSdk7Step = (
  contract: AiSdk7NativeContract,
  step: StepResult<ToolSet>,
  index: number | "final",
) =>
  emitAiSdk7NativeEvent({
    contract,
    operation: "generateText",
    kind: index === "final" ? "final-step" : "step",
    path: index === "final" ? "finalStep" : `steps[${index}]`,
    value: snapshotAiSdk7Step(step, index === "final" ? "finalStep" : `steps[${index}]`),
  });
