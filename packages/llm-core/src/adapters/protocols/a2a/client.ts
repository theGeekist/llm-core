import type {
  AgentCard,
  AgentCardSignatureVerifier,
  CancelTaskRequest,
  DeleteTaskPushNotificationConfigRequest,
  GetTaskPushNotificationConfigRequest,
  GetTaskRequest,
  ListTaskPushNotificationConfigsRequest,
  ListTaskPushNotificationConfigsResponse,
  ListTasksRequest,
  ListTasksResponse,
  SendMessageRequest,
  SendMessageResult,
  StreamResponse,
  SubscribeToTaskRequest,
  Task,
  TaskPushNotificationConfig,
} from "@a2a-js/sdk";
import {
  CancelTaskRequest as CancelTaskRequestCodec,
  GetTaskRequest as GetTaskRequestCodec,
  ListTasksRequest as ListTasksRequestCodec,
  SendMessageRequest as SendMessageRequestCodec,
  SubscribeToTaskRequest as SubscribeToTaskRequestCodec,
} from "@a2a-js/sdk";
import type { Client, RequestOptions } from "@a2a-js/sdk/client";
import {
  registerA2ANativeAgentCard,
  registerA2ANativeCancelTaskRequest,
  registerA2ANativeGetTaskRequest,
  registerA2ANativeListTasksRequest,
  registerA2ANativeListTasksResponse,
  registerA2ANativeSendMessageRequest,
  registerA2ANativeSendMessageResult,
  registerA2ANativeStreamResponse,
  registerA2ANativeSubscribeToTaskRequest,
  registerA2ANativeTask,
  unsupportedA2AOperation,
  A2AContractError,
} from "./validation";

export interface A2AClient {
  readonly protocolVersion: string;
  getAgentCard(
    options?: RequestOptions,
    verifySignature?: AgentCardSignatureVerifier,
  ): Promise<Readonly<AgentCard>>;
  sendMessage(
    params: SendMessageRequest,
    options?: RequestOptions,
  ): Promise<Readonly<SendMessageResult>>;
  sendMessageStream(
    params: SendMessageRequest,
    options?: RequestOptions,
  ): AsyncGenerator<Readonly<StreamResponse>, void, undefined>;
  getTask(params: GetTaskRequest, options?: RequestOptions): Promise<Readonly<Task>>;
  cancelTask(params: CancelTaskRequest, options?: RequestOptions): Promise<Readonly<Task>>;
  listTasks(
    params: ListTasksRequest,
    options?: RequestOptions,
  ): Promise<Readonly<ListTasksResponse>>;
  resubscribeTask(
    params: SubscribeToTaskRequest,
    options?: RequestOptions,
  ): AsyncGenerator<Readonly<StreamResponse>, void, undefined>;
  createTaskPushNotificationConfig(
    params: TaskPushNotificationConfig,
    options?: RequestOptions,
  ): Promise<TaskPushNotificationConfig>;
  getTaskPushNotificationConfig(
    params: GetTaskPushNotificationConfigRequest,
    options?: RequestOptions,
  ): Promise<TaskPushNotificationConfig>;
  listTaskPushNotificationConfig(
    params: ListTaskPushNotificationConfigsRequest,
    options?: RequestOptions,
  ): Promise<ListTaskPushNotificationConfigsResponse>;
  deleteTaskPushNotificationConfig(
    params: DeleteTaskPushNotificationConfigRequest,
    options?: RequestOptions,
  ): Promise<void>;
}

const invalidOptions = (): never => {
  throw new A2AContractError(
    "malformed-a2a-value",
    "A2A RequestOptions must contain only detached data properties.",
  );
};

const descriptorsOf = (value: object): PropertyDescriptorMap => {
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return invalidOptions();
    return Object.getOwnPropertyDescriptors(value) as PropertyDescriptorMap;
  } catch {
    return invalidOptions();
  }
};

const dataValue = (descriptor: PropertyDescriptor | undefined): unknown => {
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return invalidOptions();
  return descriptor.value;
};

const detachStringRecord = (value: unknown): Readonly<Record<string, string>> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidOptions();
  const descriptors = descriptorsOf(value);
  const detached: Record<string, string> = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") return invalidOptions();
    const item = dataValue(descriptors[key]);
    if (typeof item !== "string") return invalidOptions();
    detached[key] = item;
  }
  return Object.freeze(detached);
};

const detachContext = (value: unknown): Readonly<Record<symbol, unknown>> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidOptions();
  const descriptors = descriptorsOf(value);
  const detached = {} as Record<symbol, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "symbol") return invalidOptions();
    Object.defineProperty(detached, key, {
      enumerable: true,
      value: dataValue(descriptors[key]),
    });
  }
  return Object.freeze(detached);
};

/* eslint-disable consistent-return -- invalidOptions always throws on rejected branches. */
const detachOptions = (options: RequestOptions | undefined): RequestOptions | undefined => {
  if (options === undefined) return undefined;
  if (!options || typeof options !== "object" || Array.isArray(options)) return invalidOptions();
  const descriptors = descriptorsOf(options);
  const allowed = new Set(["signal", "serviceParameters", "context"]);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowed.has(key)) return invalidOptions();
  }
  const signalValue = descriptors.signal ? dataValue(descriptors.signal) : undefined;
  if (signalValue !== undefined && !(signalValue instanceof AbortSignal)) return invalidOptions();
  const serviceParameters = descriptors.serviceParameters
    ? detachStringRecord(dataValue(descriptors.serviceParameters))
    : undefined;
  const context = descriptors.context ? detachContext(dataValue(descriptors.context)) : undefined;
  return Object.freeze({
    ...(signalValue ? { signal: signalValue } : {}),
    ...(serviceParameters ? { serviceParameters } : {}),
    ...(context ? { context } : {}),
  });
};
/* eslint-enable consistent-return */

const requestedExtensions = (options: RequestOptions | undefined): readonly string[] => {
  if (!options) return [];
  const optionsDescriptor = Object.getOwnPropertyDescriptor(options, "serviceParameters");
  if (!optionsDescriptor || !("value" in optionsDescriptor) || !optionsDescriptor.value) return [];
  const parameters = optionsDescriptor.value as Record<string, unknown>;
  const descriptors = Object.getOwnPropertyDescriptors(parameters);
  const entry = Object.entries(descriptors).find(([key]) => key.toLowerCase() === "a2a-extensions");
  if (!entry) return [];
  const descriptor = entry[1];
  if (!("value" in descriptor) || typeof descriptor.value !== "string") {
    throw new A2AContractError("malformed-a2a-value", "A2A-Extensions must be a string.");
  }
  const values = descriptor.value.split(",").map((value) => value.trim());
  if (values.some((value) => !value) || new Set(values).size !== values.length) {
    throw new A2AContractError(
      "malformed-a2a-value",
      "A2A-Extensions must contain unique non-empty URIs.",
    );
  }
  return values;
};

const extensionGuard = (card: Readonly<AgentCard>, options: RequestOptions | undefined): void => {
  const declared = card.capabilities?.extensions ?? [];
  const requested = requestedExtensions(options);
  for (const extension of declared) {
    if (extension.required && !requested.includes(extension.uri)) {
      throw new A2AContractError(
        "extension-required",
        `Required A2A extension ${extension.uri} was not activated.`,
      );
    }
  }
  for (const extension of requested) {
    if (!declared.some((item) => item.uri === extension)) {
      throw new A2AContractError(
        "unsupported-extension",
        `A2A extension ${extension} is not declared by the Agent Card.`,
      );
    }
  }
};

const validatedStream = async function* (
  source: AsyncIterable<StreamResponse>,
): AsyncGenerator<Readonly<StreamResponse>, void, undefined> {
  for await (const event of source) yield registerA2ANativeStreamResponse(event);
};

const mutableRequest = <T>(
  codec: { fromJSON(value: unknown): T; toJSON(value: T): unknown },
  value: Readonly<T>,
): T => codec.fromJSON(codec.toJSON(value as T));

export const createA2AClient = (client: Client, agentCard: AgentCard): A2AClient => {
  const card = registerA2ANativeAgentCard(agentCard);
  if (client.protocolVersion !== "1.0") {
    throw new A2AContractError(
      "malformed-a2a-value",
      `The qualified A2A client requires protocol version 1.0, received ${client.protocolVersion}.`,
    );
  }
  const guardedOptions = (options?: RequestOptions) => {
    const detached = detachOptions(options);
    extensionGuard(card, detached);
    return detached;
  };
  return Object.freeze({
    protocolVersion: client.protocolVersion,
    getAgentCard: async (options?: RequestOptions, verifier?: AgentCardSignatureVerifier) => {
      const detached = guardedOptions(options);
      return registerA2ANativeAgentCard(await client.getAgentCard(detached, verifier));
    },
    sendMessage: async (params: SendMessageRequest, options?: RequestOptions) => {
      const detached = guardedOptions(options);
      const request = mutableRequest(
        SendMessageRequestCodec,
        registerA2ANativeSendMessageRequest(params),
      );
      return registerA2ANativeSendMessageResult(await client.sendMessage(request, detached));
    },
    sendMessageStream: (params: SendMessageRequest, options?: RequestOptions) => {
      const detached = guardedOptions(options);
      const request = mutableRequest(
        SendMessageRequestCodec,
        registerA2ANativeSendMessageRequest(params),
      );
      return validatedStream(client.sendMessageStream(request, detached));
    },
    getTask: async (params: GetTaskRequest, options?: RequestOptions) => {
      const detached = guardedOptions(options);
      const request = mutableRequest(GetTaskRequestCodec, registerA2ANativeGetTaskRequest(params));
      return registerA2ANativeTask(await client.getTask(request, detached));
    },
    cancelTask: async (params: CancelTaskRequest, options?: RequestOptions) => {
      const detached = guardedOptions(options);
      const request = mutableRequest(
        CancelTaskRequestCodec,
        registerA2ANativeCancelTaskRequest(params),
      );
      return registerA2ANativeTask(await client.cancelTask(request, detached));
    },
    listTasks: async (params: ListTasksRequest, options?: RequestOptions) => {
      const detached = guardedOptions(options);
      const request = mutableRequest(
        ListTasksRequestCodec,
        registerA2ANativeListTasksRequest(params),
      );
      return registerA2ANativeListTasksResponse(await client.listTasks(request, detached));
    },
    resubscribeTask: (params: SubscribeToTaskRequest, options?: RequestOptions) => {
      const detached = guardedOptions(options);
      const request = mutableRequest(
        SubscribeToTaskRequestCodec,
        registerA2ANativeSubscribeToTaskRequest(params),
      );
      return validatedStream(client.resubscribeTask(request, detached));
    },
    createTaskPushNotificationConfig: () =>
      unsupportedA2AOperation("createTaskPushNotificationConfig"),
    getTaskPushNotificationConfig: () => unsupportedA2AOperation("getTaskPushNotificationConfig"),
    listTaskPushNotificationConfig: () => unsupportedA2AOperation("listTaskPushNotificationConfig"),
    deleteTaskPushNotificationConfig: () =>
      unsupportedA2AOperation("deleteTaskPushNotificationConfig"),
  });
};
