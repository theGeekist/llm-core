import type { JsonValue } from "#contracts";
import { maybeMap, type MaybePromise } from "#shared/maybe";
import { normalizeStrictJson } from "./canonical-json";
import { isRegisteredToolSchema, type RegisteredToolSchema } from "./schema-registration";

export interface ToolArgumentValidationInput {
  schema: RegisteredToolSchema;
  arguments: JsonValue;
}

export interface ValidateToolArgumentsInput {
  schema: RegisteredToolSchema;
  arguments: unknown;
  port: ToolArgumentValidationPort;
}

export interface ToolArgumentIssue {
  path: string;
  code: string;
  safeMessage?: string;
}

export type ToolArgumentValidationResult =
  | { valid: true }
  | { valid: false; issues: ToolArgumentIssue[] };

/**
 * A strict validator port. Implementations must disable coercion, default
 * insertion and unknown-field stripping. The port cannot return replacement
 * arguments, so execution always receives the exact normalized input checked.
 */
export interface ToolArgumentValidationPort {
  validate(input: ToolArgumentValidationInput): MaybePromise<ToolArgumentValidationResult>;
}

export class ToolArgumentValidationError extends TypeError {
  readonly issues: ToolArgumentIssue[];

  constructor(issues: ToolArgumentIssue[]) {
    super("Tool arguments do not satisfy the registered input schema.");
    this.name = "ToolArgumentValidationError";
    this.issues = issues;
  }
}

const readValidatedArguments =
  (argumentsValue: JsonValue) =>
  (result: ToolArgumentValidationResult): JsonValue => {
    if (!result.valid) {
      throw new ToolArgumentValidationError(result.issues);
    }
    return argumentsValue;
  };

export const validateToolArguments = (
  input: ValidateToolArgumentsInput,
): MaybePromise<JsonValue> => {
  if (!isRegisteredToolSchema(input.schema)) {
    throw new TypeError("Tool argument validation requires a registered input schema.");
  }
  const argumentsValue = normalizeStrictJson(input.arguments);
  return maybeMap(
    readValidatedArguments(argumentsValue),
    input.port.validate({ schema: input.schema, arguments: argumentsValue }),
  );
};
