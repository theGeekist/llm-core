import { maybeChain, type MaybePromise } from "#shared/maybe";
import { defineToolSpec } from "./action";
import type { ToolBinding, ToolCall, ToolExecutionControl, ToolResult, ToolSpec } from "./types";
import { validateToolArguments, type ToolArgumentValidationPort } from "./validation";

export type ToolExecutor = (
  call: ToolCall,
  control?: ToolExecutionControl,
) => MaybePromise<ToolResult>;

export interface CreateToolBindingInput {
  spec: ToolSpec;
  argumentValidator: ToolArgumentValidationPort;
  execute: ToolExecutor;
}

/**
 * Creates a binding whose executable path cannot bypass strict registered
 * schema validation. The executor receives the normalized input that was
 * checked; the validator cannot substitute coerced/defaulted arguments.
 */
export const createToolBinding = (input: CreateToolBindingInput): ToolBinding => {
  const spec = defineToolSpec(input.spec);
  const validate = (call: ToolCall): MaybePromise<ToolCall> => {
    if (call.toolId !== spec.id || call.toolVersion !== spec.version) {
      throw new TypeError("Tool call identity and version must match the binding.");
    }
    return maybeChain(
      (argumentsValue): ToolCall => ({ ...call, arguments: argumentsValue }),
      validateToolArguments(spec.inputSchema, call.arguments, input.argumentValidator),
    );
  };

  return {
    spec,
    validate,
    execute: (call, control) =>
      maybeChain((validatedCall) => input.execute(validatedCall, control), validate(call)),
  };
};
