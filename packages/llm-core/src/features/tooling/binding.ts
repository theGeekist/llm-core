import { isProxy } from "node:util/types";
import { isUuidV7, type RunId, type StepId, type ToolCallId } from "#contracts";
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

const captureRebindInput = (input: RebindValidatedToolCallInput): RebindValidatedToolCallInput => {
  try {
    if (
      input === null ||
      typeof input !== "object" ||
      isProxy(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    ) {
      throw new TypeError();
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(descriptors);
    const allowed = new Set(["binding", "call", "toolCallId", "runId", "stepId"]);
    if (
      !["binding", "call", "toolCallId", "runId"].every((key) => Object.hasOwn(descriptors, key)) ||
      keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
      keys.some((key) => {
        const descriptor = descriptors[key as string];
        return descriptor?.enumerable !== true || !("value" in descriptor);
      })
    ) {
      throw new TypeError();
    }
    const captured = Object.freeze({
      binding: descriptors.binding!.value as ToolBinding,
      call: descriptors.call!.value as ToolCall,
      toolCallId: descriptors.toolCallId!.value as ToolCallId,
      runId: descriptors.runId!.value as RunId,
      ...(descriptors.stepId === undefined
        ? {}
        : { stepId: descriptors.stepId.value as StepId | undefined }),
    });
    if (
      !isUuidV7(captured.toolCallId) ||
      !isUuidV7(captured.runId) ||
      (captured.stepId !== undefined && !isUuidV7(captured.stepId))
    ) {
      throw new TypeError("Replacement tool lifecycle identities must be canonical UUIDv7 IDs.");
    }
    return captured;
  } catch (error) {
    if (error instanceof TypeError && error.message.length > 0) {
      throw error;
    }
    throw new TypeError("Validated-call rebinding requires a closed data-property input.");
  }
};

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
  const captured = captureRebindInput(input);
  const state = registeredToolBindings.get(captured.binding);
  if (!state?.validatedCalls.has(captured.call)) {
    throw new TypeError("Only a call validated by this tool binding can be rebound.");
  }
  const invocation = { ...captured.call.invocation };
  delete invocation.stepId;
  const rebound = Object.freeze({
    ...captured.call,
    toolCallId: captured.toolCallId,
    invocation: freezeJsonValue(
      normalizeStrictJson({
        ...invocation,
        runId: captured.runId,
        ...(captured.stepId === undefined ? {} : { stepId: captured.stepId }),
      }),
    ) as unknown as ToolCall["invocation"],
  });
  if (!state.validatedCalls.delete(captured.call)) {
    throw new TypeError("Validated-call provenance was already consumed.");
  }
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
