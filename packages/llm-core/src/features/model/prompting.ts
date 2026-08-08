import {
  isExternalId,
  isJsonValue,
  isNativeExtensions,
  isSchemaRef,
  type JsonValue,
  type NativeExtensions,
  type PortableContent,
  type SchemaRef,
} from "#contracts";
import { compareUtf16CodeUnits } from "#shared/fp";
import type { MaybePromise } from "#shared/maybe";
import { isPortableMediaContent } from "../media/public";

export type PromptValueType = "array" | "boolean" | "integer" | "number" | "object" | "string";

export interface PromptInputField {
  readonly name: string;
  readonly type: PromptValueType;
  readonly required: boolean;
  readonly description?: string;
}

export interface PromptTemplate {
  readonly name: string;
  readonly template: string;
  readonly inputs: readonly PromptInputField[];
  readonly outputSchema?: SchemaRef;
  readonly metadata?: NativeExtensions;
}

export type ParsedModelOutput =
  | { readonly kind: "content"; readonly content: readonly PortableContent[] }
  | { readonly kind: "json"; readonly value: JsonValue };

export interface ModelOutputParser {
  parse(request: {
    readonly text: string;
    readonly schema?: SchemaRef;
  }): MaybePromise<ParsedModelOutput>;
  formatInstructions?(): MaybePromise<string>;
}

const VALUE_TYPES = new Set<PromptValueType>([
  "array",
  "boolean",
  "integer",
  "number",
  "object",
  "string",
]);

const SENSITIVE_METADATA_KEYS = new Set([
  "apikey",
  "authorization",
  "clientsecret",
  "cookie",
  "credential",
  "filepath",
  "localpath",
  "password",
  "path",
  "privatekey",
  "providermetadata",
  "secret",
  "signedurl",
  "skillpath",
  "token",
]);
const URL = /^[a-z][a-z\d+.-]*:\/\//i;
const PATH = /^(?:\/|~\/|\.{1,2}\/|[A-Za-z]:[\\/]|\\\\|file:)/;
const CREDENTIAL =
  /^(?:bearer\s+|basic\s+|sk-[a-z0-9]|ghp_|github_pat_|xox[baprs]-|AKIA[0-9A-Z]{12}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

const normalizedKey = (key: string): string => key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();

const isSensitiveMetadataKey = (key: string): boolean => {
  const normalized = normalizedKey(key);
  return [...SENSITIVE_METADATA_KEYS].some((sensitive) => normalized.includes(sensitive));
};

export const safeNativeScalar = (value: unknown): string => {
  if (typeof value !== "string" || URL.test(value) || PATH.test(value) || CREDENTIAL.test(value)) {
    return "[redacted]";
  }
  return value;
};

const sanitizeNativeValue = (value: unknown, ancestors: Set<object>): JsonValue => {
  if (typeof value === "string") {
    return safeNativeScalar(value);
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    return null;
  }
  ancestors.add(value);
  const sanitized: JsonValue = Array.isArray(value)
    ? value.map((child) => sanitizeNativeValue(child, ancestors))
    : Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          isSensitiveMetadataKey(key) ? "[redacted]" : sanitizeNativeValue(child, ancestors),
        ]),
      );
  ancestors.delete(value);
  return sanitized;
};

export const sanitizeNativeMetadata = (value: unknown): JsonValue => {
  const sanitized = sanitizeNativeValue(value, new Set<object>());
  if (!isJsonValue(sanitized)) {
    throw new TypeError("Native metadata could not be safely projected.");
  }
  return sanitized;
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};

const isField = (value: unknown): value is PromptInputField =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => ["name", "type", "required", "description"].includes(key)) &&
  isExternalId((value as PromptInputField).name) &&
  VALUE_TYPES.has((value as PromptInputField).type) &&
  typeof (value as PromptInputField).required === "boolean" &&
  ((value as PromptInputField).description === undefined ||
    typeof (value as PromptInputField).description === "string");

export const preparePromptTemplate = (input: PromptTemplate): PromptTemplate => {
  if (
    Object.keys(input).every((key) =>
      ["name", "template", "inputs", "outputSchema", "metadata"].includes(key),
    ) === false ||
    !isExternalId(input.name) ||
    typeof input.template !== "string" ||
    input.template.length === 0 ||
    !Array.isArray(input.inputs) ||
    !input.inputs.every(isField) ||
    new Set(input.inputs.map((field) => field.name)).size !== input.inputs.length ||
    (input.outputSchema !== undefined && !isSchemaRef(input.outputSchema)) ||
    (input.metadata !== undefined && !isNativeExtensions(input.metadata))
  ) {
    throw new TypeError("Prompt templates must use a closed portable shape.");
  }
  return deepFreeze(structuredClone(input));
};

const isPortableContent = (value: unknown): value is PortableContent => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { kind?: unknown; text?: unknown; value?: unknown };
  if (candidate.kind === "text") {
    return (
      Object.keys(value).sort(compareUtf16CodeUnits).join(",") === "kind,text" &&
      typeof candidate.text === "string"
    );
  }
  if (candidate.kind === "json") {
    return (
      Object.keys(value).every((key) => ["kind", "value", "schema"].includes(key)) &&
      isJsonValue(candidate.value) &&
      ((value as { schema?: unknown }).schema === undefined ||
        isSchemaRef((value as { schema?: unknown }).schema))
    );
  }
  return isPortableMediaContent(value);
};

export const createParsedModelOutput = (value: unknown): ParsedModelOutput => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Parsed model output must use a closed portable result.");
  }
  const candidate = value as { kind?: unknown; content?: unknown; value?: unknown };
  if (
    candidate.kind === "content" &&
    Object.keys(value).sort(compareUtf16CodeUnits).join(",") === "content,kind" &&
    Array.isArray(candidate.content) &&
    candidate.content.length > 0 &&
    candidate.content.every(isPortableContent)
  ) {
    return deepFreeze(structuredClone(candidate)) as ParsedModelOutput;
  }
  if (
    candidate.kind === "json" &&
    Object.keys(value).sort(compareUtf16CodeUnits).join(",") === "kind,value" &&
    isJsonValue(candidate.value)
  ) {
    return deepFreeze(structuredClone(candidate)) as ParsedModelOutput;
  }
  throw new TypeError("Parsed model output must use a closed portable result.");
};
