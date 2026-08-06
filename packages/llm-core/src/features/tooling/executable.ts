import { isProxy } from "node:util/types";
import { isUuidV7, type RunId, type StepId, type ToolCallId } from "#contracts";
import { maybeChain, type MaybePromise } from "#shared/maybe";
import { deepFreeze, normalize } from "@geekist/strict-json";
import { defineToolDefinition } from "./action";
import type {
  ExecutableTool,
  ExecutableToolValidationInput,
  ToolCall,
  ToolExecutionInput,
  ToolExecutionResult,
  ToolDefinition,
} from "./types";
import { validateToolArguments, type ToolArgumentValidationPort } from "./validation";

interface RegisteredExecutableToolState {
  validatedCalls: WeakSet<object>;
}

const registeredExecutableTools = new WeakMap<object, RegisteredExecutableToolState>();

export type ToolExecutor = (input: ToolExecutionInput) => MaybePromise<ToolExecutionResult>;

export interface CreateExecutableToolInput {
  definition: ToolDefinition;
  argumentValidator: ToolArgumentValidationPort;
  execute: ToolExecutor;
}

export interface RebindValidatedToolCallInput {
  tool: ExecutableTool;
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
    const allowed = new Set(["tool", "call", "toolCallId", "runId", "stepId"]);
    if (
      !["tool", "call", "toolCallId", "runId"].every((key) => Object.hasOwn(descriptors, key)) ||
      keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
      keys.some((key) => {
        const descriptor = descriptors[key as string];
        return descriptor?.enumerable !== true || !("value" in descriptor);
      })
    ) {
      throw new TypeError();
    }
    const captured = Object.freeze({
      tool: descriptors.tool!.value as ExecutableTool,
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

/** Returns true only for the exact facade returned by `createExecutableTool`. */
export const isRegisteredExecutableTool = (value: unknown): value is ExecutableTool =>
  value !== null &&
  (typeof value === "object" || typeof value === "function") &&
  registeredExecutableTools.has(value);

/**
 * Rebinds only durable lifecycle identity while preserving an executable tool's
 * one-shot proof that the call's external arguments were already validated.
 */
export const rebindValidatedToolCall = (input: RebindValidatedToolCallInput): ToolCall => {
  const captured = captureRebindInput(input);
  const state = registeredExecutableTools.get(captured.tool);
  if (!state?.validatedCalls.has(captured.call)) {
    throw new TypeError("Only a call validated by this executable tool can be rebound.");
  }
  const invocation = { ...captured.call.invocation };
  delete invocation.stepId;
  const rebound = Object.freeze({
    ...captured.call,
    toolCallId: captured.toolCallId,
    invocation: deepFreeze(
      normalize({
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
 * Creates a tool whose executable path cannot bypass strict registered
 * schema validation. The executor receives the normalized input that was
 * checked; the validator cannot substitute coerced/defaulted arguments.
 */
export const createExecutableTool = (input: CreateExecutableToolInput): ExecutableTool => {
  const definition = defineToolDefinition(input.definition);
  const argumentValidator = input.argumentValidator;
  const executor = input.execute;
  const validatedCalls = new WeakSet<object>();
  const validate = ({ call }: ExecutableToolValidationInput): MaybePromise<ToolCall> => {
    if (call.toolId !== definition.id || call.toolVersion !== definition.version) {
      throw new TypeError("Tool call identity and version must match the executable tool.");
    }
    return maybeChain(
      (argumentsValue): ToolCall => {
        const validatedCall = Object.freeze({
          ...call,
          arguments: deepFreeze(argumentsValue) as unknown as ToolCall["arguments"],
          invocation: deepFreeze(normalize(call.invocation)) as unknown as ToolCall["invocation"],
        });
        validatedCalls.add(validatedCall);
        return validatedCall;
      },
      validateToolArguments({
        schema: definition.inputSchema,
        arguments: call.arguments,
        port: argumentValidator,
      }),
    );
  };

  const tool: ExecutableTool = Object.freeze({
    definition,
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
  registeredExecutableTools.set(tool, { validatedCalls });
  return tool;
};
