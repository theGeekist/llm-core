import { createHash } from "node:crypto";
import {
  contractVersion,
  digest,
  isJsonValue,
  type ContractVersion,
  type JsonValue,
  type PortableContent,
} from "#contracts";
import { isPromiseLike, maybeMap, type MaybePromise } from "#shared/maybe";
import { createExecutableTool } from "./executable";
import { registerToolSchema } from "./schema-registration";
import type {
  EffectClass,
  ExecutableTool,
  ToolEffect,
  ToolExecutionResult,
  ToolExecutionSemantics,
} from "./types";
import type { ToolArgumentValidationResult } from "./validation";
import { toolId } from "./action";

declare const toolArgumentsBrand: unique symbol;

/**
 * A caller-owned schema and strict validation operation.
 *
 * Validation reports acceptance only: it cannot coerce, default, strip, or
 * replace the arguments that execution receives.
 */
export interface ToolInput<TArguments extends JsonValue = JsonValue> {
  readonly schema: JsonValue;
  validate(argumentsValue: JsonValue): MaybePromise<ToolArgumentValidationResult>;
  readonly [toolArgumentsBrand]?: TArguments;
}

export interface ToolConfig<TArguments extends JsonValue = JsonValue> {
  readonly name: string;
  readonly description: string;
  readonly input: ToolInput<TArguments>;
  readonly effect: EffectClass | ToolEffect;
  readonly execution?: Partial<ToolExecutionSemantics>;
  readonly version?: ContractVersion;
  execute(argumentsValue: TArguments): MaybePromise<JsonValue>;
}

/**
 * Ready common tool object. Runtime lifecycle and validation operations remain
 * available only through the explicit `./tools/runtime` front.
 */
export interface Tool<TArguments extends JsonValue = JsonValue> {
  readonly name: string;
  readonly description: string;
  readonly [toolArgumentsBrand]?: TArguments;
}

const executableTools = new WeakMap<object, ExecutableTool>();

const executionSemantics = (config: ToolConfig, effect: ToolEffect): ToolExecutionSemantics => ({
  concurrency: config.execution?.concurrency ?? "shared",
  cancellation: config.execution?.cancellation ?? "cooperative",
  idempotency:
    config.execution?.idempotency ?? (effect.class === "read-only" ? "not-supported" : "required"),
  retryAfterStart: config.execution?.retryAfterStart ?? "never",
});

const normalizeEffect = (effect: ToolConfig["effect"]): ToolEffect => {
  if (typeof effect !== "string") {
    return {
      class: effect.class,
      targets: [...effect.targets],
    };
  }
  if (effect !== "read-only") {
    throw new TypeError("Meaningful tool effects require explicit targets.");
  }
  return { class: effect, targets: [] };
};

const schemaDigest = (canonicalSchema: string) =>
  digest(createHash("sha256").update(canonicalSchema, "utf8").digest("hex"));

const contentFor = (value: JsonValue): PortableContent[] =>
  typeof value === "string" ? [{ kind: "text", text: value }] : [{ kind: "json", value }];

/** Define a ready tool without exposing schema registration or runtime execution machinery. */
export const defineTool = <TArguments extends JsonValue>(
  config: ToolConfig<TArguments>,
): Tool<TArguments> => {
  if (
    typeof config.name !== "string" ||
    typeof config.description !== "string" ||
    typeof config.input?.validate !== "function" ||
    !isJsonValue(config.input.schema) ||
    typeof config.execute !== "function"
  ) {
    throw new TypeError(
      "Tool definitions require a name, description, input, effect, and execute.",
    );
  }
  const id = toolId(config.name);
  const effect = normalizeEffect(config.effect);
  const validateArguments = config.input.validate;
  const execute = config.execute;
  const inputSchema = registerToolSchema(config.input.schema, { digest: schemaDigest });
  if (isPromiseLike(inputSchema)) {
    throw new TypeError("The built-in tool schema digest must complete synchronously.");
  }
  const executable = createExecutableTool({
    definition: {
      id,
      version: config.version ?? contractVersion("1.0.0"),
      description: config.description,
      inputSchema,
      effect,
      execution: executionSemantics(config, effect),
    },
    argumentValidator: {
      validate: ({ arguments: argumentsValue }) => validateArguments(argumentsValue),
    },
    execute: ({ call }): MaybePromise<ToolExecutionResult> =>
      maybeMap(
        (value): ToolExecutionResult => {
          if (!isJsonValue(value)) {
            throw new TypeError("Tool execution must return a portable JSON value.");
          }
          return {
            toolCallId: call.toolCallId,
            status: "succeeded",
            content: contentFor(value),
          };
        },
        execute(call.arguments as TArguments),
      ),
  });
  const tool = Object.freeze({
    name: config.name,
    description: config.description,
  }) as Tool<TArguments>;
  executableTools.set(tool, executable);
  return tool;
};

/** @internal Application composition only. */
export const readExecutableTool = (tool: Tool): ExecutableTool => {
  const executable = executableTools.get(tool);
  if (!executable) {
    throw new TypeError("Agents require Tool values created by defineTool.");
  }
  return executable;
};
