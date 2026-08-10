import {
  coreId,
  isJsonValue,
  type InvocationContext,
  type JsonValue,
  type ToolCallId,
} from "#contracts";
import { canonicalize, deepFreeze, normalize } from "@aifsd/strict-json";
import {
  specTypeSchemas,
  type CallToolResult,
  type ReadResourceResult,
  type ToolAnnotations,
} from "@modelcontextprotocol/server";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";
import { registerCapabilityInvocation } from "../../../application/capability-bindings/public";
import { isRegisteredExecutableTool } from "../../../tools/runtime";
import type {
  McpControlledToolExecutionInput,
  McpPrincipal,
  McpResourceBinding,
  McpResourceDefinition,
  McpStatelessHostDefinition,
  McpToolBinding,
  McpToolDefinition,
} from "./types";

export class McpBoundaryError extends TypeError {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "McpBoundaryError";
    this.code = code;
  }
}

type DataRecord = Readonly<Record<string, unknown>>;

const exactDataRecord = (value: unknown, keys: readonly string[], label: string): DataRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new McpBoundaryError("invalid-boundary", `${label} must be a plain data object.`);
  }
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value) as PropertyDescriptorMap;
  } catch {
    throw new McpBoundaryError("invalid-boundary", `${label} must be inspectable data.`);
  }
  const actual = Reflect.ownKeys(descriptors);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key)) ||
    Object.values(descriptors).some(
      (descriptor) => !("value" in descriptor) || descriptor.enumerable !== true,
    )
  ) {
    throw new McpBoundaryError(
      "invalid-boundary",
      `${label} must contain only declared enumerable data fields.`,
    );
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]),
    ),
  );
};

const dataArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new McpBoundaryError("invalid-boundary", `${label} must be an array.`);
  }
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap;
  } catch {
    throw new McpBoundaryError("invalid-boundary", `${label} must be inspectable data.`);
  }
  const length = descriptors.length;
  if (!length || !("value" in length) || !Number.isSafeInteger(length.value)) {
    throw new McpBoundaryError("invalid-boundary", `${label} has an invalid length.`);
  }
  const items: unknown[] = [];
  for (let index = 0; index < length.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      throw new McpBoundaryError("invalid-boundary", `${label} must be a dense data array.`);
    }
    items.push(descriptor.value);
  }
  const allowed = new Set(["length", ...items.map((_, index) => String(index))]);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw new McpBoundaryError("invalid-boundary", `${label} contains undeclared fields.`);
  }
  return Object.freeze(items);
};

const nonEmpty = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new McpBoundaryError("invalid-boundary", `${label} must be a non-empty string.`);
  }
  return value;
};

const optionalString = (value: unknown, label: string): string | undefined =>
  value === undefined ? undefined : nonEmpty(value, label);

const portable = (value: unknown, label: string): JsonValue => {
  let snapshot: JsonValue;
  try {
    snapshot = normalize(value);
  } catch {
    throw new McpBoundaryError("invalid-boundary", `${label} must be accessor-free strict JSON.`);
  }
  if (!isJsonValue(snapshot)) {
    throw new McpBoundaryError("invalid-boundary", `${label} must be strict JSON.`);
  }
  return deepFreeze(snapshot) as unknown as JsonValue;
};

const schemaValidator = new AjvJsonSchemaValidator();

const jsonSchema = (value: unknown, label: string, objectRoot: boolean): JsonValue => {
  const snapshot = portable(value, label);
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    throw new McpBoundaryError("invalid-tool-schema", `${label} must be a JSON Schema object.`);
  }
  if (objectRoot && snapshot.type !== "object") {
    throw new McpBoundaryError(
      "invalid-tool-schema",
      `${label} must be an object-root JSON Schema.`,
    );
  }
  try {
    schemaValidator.getValidator(snapshot as Record<string, unknown>);
  } catch {
    throw new McpBoundaryError(
      "invalid-tool-schema",
      `${label} must be a complete valid JSON Schema.`,
    );
  }
  return snapshot;
};

const toolAnnotations = (value: unknown): ToolAnnotations => {
  const snapshot = portable(value, "MCP tool annotations");
  const validation = specTypeSchemas.ToolAnnotations["~standard"].validate(snapshot);
  if (validation instanceof Promise || validation.issues) {
    throw new McpBoundaryError(
      "invalid-tool-annotations",
      "MCP tool annotations must satisfy the exact SDK contract.",
    );
  }
  const validated = portable(validation.value, "MCP tool annotations");
  if (canonicalize(snapshot) !== canonicalize(validated)) {
    throw new McpBoundaryError(
      "invalid-tool-annotations",
      "MCP tool annotations must not contain undeclared fields.",
    );
  }
  return validated as ToolAnnotations;
};

const compareUtf8 = (left: string, right: string): number => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index]! - rightBytes[index]!;
  }
  return leftBytes.length - rightBytes.length;
};

const toolDefinition = (value: unknown): McpToolDefinition => {
  const record = exactDataRecord(
    value,
    ["name", "title", "description", "outputSchema", "annotations"],
    "MCP tool definition",
  );
  const annotations =
    record.annotations === undefined ? undefined : toolAnnotations(record.annotations);
  return Object.freeze({
    name: nonEmpty(record.name, "MCP tool name"),
    ...(optionalString(record.title, "MCP tool title") ? { title: record.title as string } : {}),
    ...(optionalString(record.description, "MCP tool description")
      ? { description: record.description as string }
      : {}),
    ...(record.outputSchema === undefined
      ? {}
      : { outputSchema: jsonSchema(record.outputSchema, "MCP tool outputSchema", true) }),
    ...(annotations === undefined ? {} : { annotations }),
  });
};

const resourceDefinition = (value: unknown): McpResourceDefinition => {
  const record = exactDataRecord(
    value,
    ["name", "uri", "title", "description", "mimeType"],
    "MCP resource definition",
  );
  const uri = nonEmpty(record.uri, "MCP resource URI");
  try {
    new URL(uri);
  } catch {
    throw new McpBoundaryError("invalid-resource-uri", "MCP resource URI must be absolute.");
  }
  return Object.freeze({
    name: nonEmpty(record.name, "MCP resource name"),
    uri,
    ...(optionalString(record.title, "MCP resource title")
      ? { title: record.title as string }
      : {}),
    ...(optionalString(record.description, "MCP resource description")
      ? { description: record.description as string }
      : {}),
    ...(optionalString(record.mimeType, "MCP resource mimeType")
      ? { mimeType: record.mimeType as string }
      : {}),
  });
};

const uniqueSorted = <T>(
  values: readonly T[],
  identity: (value: T) => string,
  label: string,
): T[] => {
  const sorted = [...values].sort((left, right) => compareUtf8(identity(left), identity(right)));
  if (
    sorted.some((value, index) => index > 0 && identity(value) === identity(sorted[index - 1]!))
  ) {
    throw new McpBoundaryError("duplicate-binding", `${label} identities must be unique.`);
  }
  return sorted;
};

const toolBinding = (value: unknown): McpToolBinding => {
  const record = exactDataRecord(
    value,
    ["definition", "tool", "prepareControlledExecution"],
    "MCP tool binding",
  );
  if (!isRegisteredExecutableTool(record.tool)) {
    throw new McpBoundaryError(
      "invalid-boundary",
      "MCP tool bindings require a registered kernel ExecutableTool.",
    );
  }
  if (typeof record.prepareControlledExecution !== "function") {
    throw new McpBoundaryError(
      "invalid-boundary",
      "MCP tool prepareControlledExecution must be a data function.",
    );
  }
  jsonSchema(record.tool.definition.inputSchema.document, "MCP tool inputSchema", true);
  return Object.freeze({
    definition: toolDefinition(record.definition),
    tool: record.tool,
    prepareControlledExecution:
      record.prepareControlledExecution as McpToolBinding["prepareControlledExecution"],
  });
};

const resourceBinding = (value: unknown): McpResourceBinding => {
  const record = exactDataRecord(value, ["definition", "read"], "MCP resource binding");
  if (typeof record.read !== "function") {
    throw new McpBoundaryError("invalid-boundary", "MCP resource read must be a data function.");
  }
  return Object.freeze({
    definition: resourceDefinition(record.definition),
    read: record.read as McpResourceBinding["read"],
  });
};

export interface RegisteredMcpStatelessHost {
  readonly name: string;
  readonly version: string;
  readonly tools: readonly McpToolBinding[];
  readonly resources: readonly McpResourceBinding[];
  readonly legacy: "reject" | "stateless";
  readonly authenticate: McpStatelessHostDefinition["authenticate"];
  readonly authorise: McpStatelessHostDefinition["authorise"];
}

export const registerMcpStatelessHostDefinition = (value: unknown): RegisteredMcpStatelessHost => {
  const record = exactDataRecord(
    value,
    ["name", "version", "tools", "resources", "legacy", "authenticate", "authorise"],
    "MCP stateless host definition",
  );
  if (typeof record.authenticate !== "function" || typeof record.authorise !== "function") {
    throw new McpBoundaryError(
      "invalid-boundary",
      "MCP authenticate and authorise hooks must be data functions.",
    );
  }
  if (record.legacy !== undefined && record.legacy !== "reject" && record.legacy !== "stateless") {
    throw new McpBoundaryError("invalid-boundary", "MCP legacy mode must be reject or stateless.");
  }
  const tools = uniqueSorted(
    dataArray(record.tools, "MCP tools").map(toolBinding),
    (binding) => binding.definition.name,
    "MCP tool",
  );
  const resources = uniqueSorted(
    dataArray(record.resources, "MCP resources").map(resourceBinding),
    (binding) => binding.definition.uri,
    "MCP resource",
  );
  return Object.freeze({
    name: nonEmpty(record.name, "MCP server name"),
    version: nonEmpty(record.version, "MCP server version"),
    tools: Object.freeze(tools),
    resources: Object.freeze(resources),
    legacy: (record.legacy ?? "reject") as "reject" | "stateless",
    authenticate: record.authenticate as McpStatelessHostDefinition["authenticate"],
    authorise: record.authorise as McpStatelessHostDefinition["authorise"],
  });
};

const CONTROLLED_EXECUTION_KEYS = [
  "call",
  "securityDomain",
  "digestKeyRef",
  "digestPort",
  "policy",
  "approval",
  "journal",
  "receiptOwner",
  "receiptLeaseDurationMs",
  "concurrency",
  "facts",
  "eventSink",
  "redaction",
  "specification",
] as const;

const REQUIRED_CONTROLLED_EXECUTION_KEYS = [
  "call",
  "securityDomain",
  "digestKeyRef",
  "digestPort",
  "journal",
  "receiptOwner",
  "receiptLeaseDurationMs",
  "concurrency",
  "facts",
] as const;

const controlledCall = (
  value: unknown,
  binding: McpToolBinding,
  expectedArguments: JsonValue,
): McpControlledToolExecutionInput["call"] => {
  const record = exactDataRecord(
    value,
    ["toolCallId", "toolId", "toolVersion", "arguments", "invocation", "idempotencyKey"],
    "MCP controlled ToolCall",
  );
  const argumentsValue = portable(record.arguments, "MCP controlled ToolCall arguments");
  const invocationSnapshot = portable(record.invocation, "MCP controlled ToolCall invocation");
  if (
    typeof invocationSnapshot !== "object" ||
    invocationSnapshot === null ||
    Array.isArray(invocationSnapshot) ||
    record.toolId !== binding.tool.definition.id ||
    record.toolVersion !== binding.tool.definition.version ||
    canonicalize(argumentsValue) !== canonicalize(expectedArguments)
  ) {
    throw new McpBoundaryError(
      "invalid-controlled-call",
      "MCP controlled ToolCall identity and arguments must match the registered invocation.",
    );
  }
  const invocation = registerCapabilityInvocation({
    invocationContext: invocationSnapshot as unknown as InvocationContext,
  }).invocationContext;
  return Object.freeze({
    toolCallId: coreId<ToolCallId>(nonEmpty(record.toolCallId, "MCP controlled toolCallId")),
    toolId: binding.tool.definition.id,
    toolVersion: binding.tool.definition.version,
    arguments: argumentsValue,
    invocation,
    ...(record.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: nonEmpty(record.idempotencyKey, "MCP controlled idempotencyKey") }),
  });
};

export const registerMcpControlledExecution = (
  value: unknown,
  binding: McpToolBinding,
  expectedArguments: JsonValue,
): McpControlledToolExecutionInput => {
  const record = exactDataRecord(
    value,
    CONTROLLED_EXECUTION_KEYS,
    "MCP controlled execution input",
  );
  if (REQUIRED_CONTROLLED_EXECUTION_KEYS.some((key) => !Object.hasOwn(record, key))) {
    throw new McpBoundaryError(
      "invalid-controlled-execution",
      "MCP controlled execution input is missing required fields.",
    );
  }
  const receiptLeaseDurationMs = record.receiptLeaseDurationMs;
  if (!Number.isSafeInteger(receiptLeaseDurationMs) || (receiptLeaseDurationMs as number) <= 0) {
    throw new McpBoundaryError(
      "invalid-controlled-execution",
      "MCP controlled execution receipt lease must be a positive integer.",
    );
  }
  return Object.freeze({
    ...record,
    call: controlledCall(record.call, binding, expectedArguments),
    securityDomain: nonEmpty(record.securityDomain, "MCP controlled securityDomain"),
    receiptLeaseDurationMs,
  }) as McpControlledToolExecutionInput;
};

export const registerMcpPrincipal = (value: unknown): McpPrincipal => {
  const record = exactDataRecord(value, ["id", "scopes", "attributes"], "MCP principal");
  const scopes = dataArray(record.scopes, "MCP principal scopes").map((scope) =>
    nonEmpty(scope, "MCP principal scope"),
  );
  if (new Set(scopes).size !== scopes.length) {
    throw new McpBoundaryError("invalid-principal", "MCP principal scopes must be unique.");
  }
  return Object.freeze({
    id: nonEmpty(record.id, "MCP principal id"),
    scopes: Object.freeze([...scopes].sort()),
    ...(record.attributes === undefined
      ? {}
      : { attributes: portable(record.attributes, "MCP principal attributes") }),
  });
};

const validateSdkResult = async <T>(input: {
  readonly schema: (typeof specTypeSchemas)["CallToolResult" | "ReadResourceResult"];
  readonly value: unknown;
  readonly label: string;
  readonly keys: readonly string[];
}): Promise<T> => {
  const { schema, value, label, keys } = input;
  const snapshot = portable(value, label);
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    throw new McpBoundaryError("invalid-native-result", `${label} must be an object.`);
  }
  if (Object.keys(snapshot).some((key) => !keys.includes(key))) {
    throw new McpBoundaryError("invalid-native-result", `${label} contains undeclared fields.`);
  }
  const validation = await schema["~standard"].validate(snapshot);
  if (validation.issues) {
    throw new McpBoundaryError("invalid-native-result", `${label} is not a valid MCP result.`);
  }
  return portable(validation.value, label) as unknown as T;
};

export const registerMcpToolResult = (value: unknown): Promise<CallToolResult> =>
  validateSdkResult<CallToolResult>({
    schema: specTypeSchemas.CallToolResult,
    value,
    label: "MCP tool result",
    keys: ["content", "structuredContent", "isError", "_meta"],
  });

export const registerMcpResourceResult = (value: unknown): Promise<ReadResourceResult> =>
  validateSdkResult<ReadResourceResult>({
    schema: specTypeSchemas.ReadResourceResult,
    value,
    label: "MCP resource result",
    keys: ["contents", "_meta"],
  });
