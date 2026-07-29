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
      Object.keys(value).sort().join(",") === "kind,text" && typeof candidate.text === "string"
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

export const registerParsedModelOutput = (value: unknown): ParsedModelOutput => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Parsed model output must use a closed portable result.");
  }
  const candidate = value as { kind?: unknown; content?: unknown; value?: unknown };
  if (
    candidate.kind === "content" &&
    Object.keys(value).sort().join(",") === "content,kind" &&
    Array.isArray(candidate.content) &&
    candidate.content.length > 0 &&
    candidate.content.every(isPortableContent)
  ) {
    return deepFreeze(structuredClone(candidate)) as ParsedModelOutput;
  }
  if (
    candidate.kind === "json" &&
    Object.keys(value).sort().join(",") === "kind,value" &&
    isJsonValue(candidate.value)
  ) {
    return deepFreeze(structuredClone(candidate)) as ParsedModelOutput;
  }
  throw new TypeError("Parsed model output must use a closed portable result.");
};
