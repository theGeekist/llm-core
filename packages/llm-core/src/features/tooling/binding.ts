import { maybeChain, type MaybePromise } from "#shared/maybe";
import type { RunId, StepId, ToolCallId } from "#contracts";
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

interface RegisteredToolBindingState {
  validatedCalls: WeakSet<object>;
}

const registeredToolBindings = new WeakMap<object, RegisteredToolBindingState>();

export type ToolExecutor = (input: ToolExecutionInput) => MaybePromise<ToolResult>;

export interface CreateToolBindingInput {
  spec: ToolSpec;
  argumentValidator: ToolArgumentValidationPort;
  execute: ToolExecutor;
}

export interface RebindValidatedToolCallInput {
  binding: ToolBinding;
  call: ToolCall;
  toolCallId: ToolCallId;
  runId: RunId;
  stepId?: StepId;
}

/** Returns true only for the exact facade returned by `createToolBinding`. */
export const isRegisteredToolBinding = (value: unknown): value is ToolBinding =>
  value !== null &&
  (typeof value === "object" || typeof value === "function") &&
  registeredToolBindings.has(value);

/**
 * Rebinds only durable lifecycle identity while preserving a binding's
 * one-shot proof that the call's external arguments were already validated.
 */
export const rebindValidatedToolCall = (input: RebindValidatedToolCallInput): ToolCall => {
  const state = registeredToolBindings.get(input.binding);
  if (!state?.validatedCalls.has(input.call)) {
    throw new TypeError("Only a call validated by this tool binding can be rebound.");
  }
  const invocation = { ...input.call.invocation };
  delete invocation.stepId;
  const rebound = Object.freeze({
    ...input.call,
    toolCallId: input.toolCallId,
    invocation: freezeJsonValue(
      normalizeStrictJson({
        ...invocation,
        runId: input.runId,
        ...(input.stepId === undefined ? {} : { stepId: input.stepId }),
      }),
    ) as unknown as ToolCall["invocation"],
  });
  state.validatedCalls.delete(input.call);
  state.validatedCalls.add(rebound);
  return rebound;
};

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
  registeredToolBindings.set(binding, { validatedCalls });
  return binding;
};
