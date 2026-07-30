import { maybeChain, type MaybePromise } from "#shared/maybe";
import { defineToolSpec } from "./action";
import { freezeJsonValue, normalizeStrictJson } from "./canonical-json";
import type {
  ToolBinding,
  ToolBindingValidationInput,
  ToolCall,
  ToolExecutionInput,
  ToolResult,
  ToolSpec,
} from "./types";
import { validateToolArguments, type ToolArgumentValidationPort } from "./validation";

const registeredToolBindings = new WeakSet<object>();

export type ToolExecutor = (input: ToolExecutionInput) => MaybePromise<ToolResult>;

export interface CreateToolBindingInput {
  spec: ToolSpec;
  argumentValidator: ToolArgumentValidationPort;
  execute: ToolExecutor;
}

/** Returns true only for the exact facade returned by `createToolBinding`. */
export const isRegisteredToolBinding = (value: unknown): value is ToolBinding =>
  value !== null &&
  (typeof value === "object" || typeof value === "function") &&
  registeredToolBindings.has(value);

/**
 * Creates a binding whose executable path cannot bypass strict registered
 * schema validation. The executor receives the normalized input that was
 * checked; the validator cannot substitute coerced/defaulted arguments.
 */
export const createToolBinding = (input: CreateToolBindingInput): ToolBinding => {
  const spec = defineToolSpec(input.spec);
  const argumentValidator = input.argumentValidator;
  const executor = input.execute;
  const validatedCalls = new WeakSet<object>();
  const validate = ({ call }: ToolBindingValidationInput): MaybePromise<ToolCall> => {
    if (call.toolId !== spec.id || call.toolVersion !== spec.version) {
      throw new TypeError("Tool call identity and version must match the binding.");
    }
    return maybeChain(
      (argumentsValue): ToolCall => {
        const validatedCall = Object.freeze({
          ...call,
          arguments: freezeJsonValue(argumentsValue),
          invocation: freezeJsonValue(
            normalizeStrictJson(call.invocation),
          ) as unknown as ToolCall["invocation"],
        });
        validatedCalls.add(validatedCall);
        return validatedCall;
      },
      validateToolArguments({
        schema: spec.inputSchema,
        arguments: call.arguments,
        port: argumentValidator,
      }),
    );
  };

  const binding: ToolBinding = Object.freeze({
    spec,
    validate,
    execute: (executionInput: ToolExecutionInput) =>
      validatedCalls.delete(executionInput.call)
        ? executor(executionInput)
        : maybeChain(
            (validatedCall) =>
              executor({
                call: validatedCall,
                ...(executionInput.control ? { control: executionInput.control } : {}),
              }),
            validate({ call: executionInput.call }),
          ),
  });
  registeredToolBindings.add(binding);
  return binding;
};
