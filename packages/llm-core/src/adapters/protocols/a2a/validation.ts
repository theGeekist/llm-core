import { canonicalize, snapshot, type FrozenJsonValue } from "@aifsd/strict-json";
import { types as nodeTypes } from "node:util";
import {
  AgentCard,
  CancelTaskRequest,
  GetExtendedAgentCardRequest,
  GetTaskRequest,
  ListTasksRequest,
  ListTasksResponse,
  Message,
  SendMessageRequest,
  SendMessageResponse,
  StreamResponse,
  SubscribeToTaskRequest,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
  type AgentCard as AgentCardValue,
  type CancelTaskRequest as CancelTaskRequestValue,
  type GetTaskRequest as GetTaskRequestValue,
  type ListTasksRequest as ListTasksRequestValue,
  type ListTasksResponse as ListTasksResponseValue,
  type Message as MessageValue,
  type MessageFns,
  type SendMessageRequest as SendMessageRequestValue,
  type SendMessageResult,
  type StreamResponse as StreamResponseValue,
  type SubscribeToTaskRequest as SubscribeToTaskRequestValue,
  type Task as TaskValue,
} from "@a2a-js/sdk";

export class A2AContractError extends TypeError {
  readonly code:
    | "extension-required"
    | "malformed-a2a-value"
    | "unsupported-extension"
    | "unsupported-operation";

  constructor(code: A2AContractError["code"], message: string) {
    super(message);
    this.name = "A2AContractError";
    this.code = code;
  }
}

export type A2ACanonicalJson = FrozenJsonValue;

const malformed = (name: string): never => {
  throw new A2AContractError(
    "malformed-a2a-value",
    `${name} must be the exact canonical A2A 1.0 JSON shape.`,
  );
};

const canonicalSnapshot = (value: unknown, name: string): FrozenJsonValue => {
  try {
    return snapshot(value);
  } catch {
    return malformed(name);
  }
};

type SemanticCheck = (value: FrozenJsonValue) => void;
type NativeSemanticCheck<T> = (value: T) => void;

const record = (value: unknown): value is Record<string, FrozenJsonValue> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const objectRecord = (value: unknown, name: string): Record<string, FrozenJsonValue> => {
  if (!record(value)) return malformed(name);
  return value;
};

const nonEmpty = (value: unknown, name: string): void => {
  if (typeof value !== "string" || !value.trim()) malformed(name);
};

const leapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return leapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};
const timestampMatch = (value: unknown, name: string): RegExpExecArray => {
  if (typeof value !== "string") return malformed(name);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}|\d{6}|\d{9}))?Z$/.exec(
    value,
  );
  return match ?? malformed(name);
};

const validTimestamp = (value: unknown, name: string): void => {
  const match = timestampMatch(value, name);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    malformed(name);
  }
};

const messageSemantic: SemanticCheck = (value) => {
  const input = objectRecord(value, "Message");
  nonEmpty(input.messageId, "Message.messageId");
  if (!Array.isArray(input.parts) || input.parts.length === 0) malformed("Message.parts");
};

const taskSemantic: SemanticCheck = (value) => {
  const input = objectRecord(value, "Task");
  nonEmpty(input.id, "Task.id");
  nonEmpty(input.contextId, "Task.contextId");
  const status = objectRecord(input.status, "Task.status");
  if (status.state === "TASK_STATE_UNSPECIFIED" || status.state === undefined)
    malformed("Task.status.state");
  if (status.timestamp !== undefined) validTimestamp(status.timestamp, "Task.status.timestamp");
};

const idRequestSemantic =
  (name: string): SemanticCheck =>
  (value) => {
    const input = objectRecord(value, name);
    nonEmpty(input.id, `${name}.id`);
  };

const streamSemantic: SemanticCheck = (value) => {
  const input = objectRecord(value, "StreamResponse");
  if (input.task !== undefined) taskSemantic(input.task);
  if (input.message !== undefined) messageSemantic(input.message);
  if (input.statusUpdate !== undefined) {
    const update = objectRecord(input.statusUpdate, "TaskStatusUpdateEvent");
    nonEmpty(update.taskId, "TaskStatusUpdateEvent.taskId");
    nonEmpty(update.contextId, "TaskStatusUpdateEvent.contextId");
    const status = objectRecord(update.status, "TaskStatusUpdateEvent.status");
    if (status.state === "TASK_STATE_UNSPECIFIED" || status.state === undefined)
      malformed("TaskStatusUpdateEvent.status.state");
    if (status.timestamp !== undefined)
      validTimestamp(status.timestamp, "TaskStatusUpdateEvent.status.timestamp");
  }
  if (input.artifactUpdate !== undefined) {
    const update = objectRecord(input.artifactUpdate, "TaskArtifactUpdateEvent");
    nonEmpty(update.taskId, "TaskArtifactUpdateEvent.taskId");
    nonEmpty(update.contextId, "TaskArtifactUpdateEvent.contextId");
    const artifactValue = objectRecord(update.artifact, "TaskArtifactUpdateEvent.artifact");
    nonEmpty(artifactValue.artifactId, "Artifact.artifactId");
    if (!Array.isArray(artifactValue.parts) || artifactValue.parts.length === 0)
      malformed("Artifact.parts");
  }
};

const nativeMessageSemantic = (message: MessageValue): void => {
  nonEmpty(message.messageId, "Message.messageId");
  if (message.parts.length === 0) malformed("Message.parts");
  for (const part of message.parts) {
    if (!part.content) malformed("Part.content");
  }
};

const nativeTaskSemantic = (taskValue: TaskValue): void => {
  nonEmpty(taskValue.id, "Task.id");
  nonEmpty(taskValue.contextId, "Task.contextId");
  const status = taskValue.status;
  if (!status || status.state === 0 || status.state === -1) malformed("Task.status.state");
  if (!status) return;
  if (status.timestamp !== undefined) validTimestamp(status.timestamp, "Task.status.timestamp");
  if (status.message) nativeMessageSemantic(status.message);
  for (const historyMessage of taskValue.history) nativeMessageSemantic(historyMessage);
  for (const artifactValue of taskValue.artifacts) {
    nonEmpty(artifactValue.artifactId, "Artifact.artifactId");
    if (artifactValue.parts.length === 0) malformed("Artifact.parts");
    for (const part of artifactValue.parts) {
      if (!part.content) malformed("Part.content");
    }
  }
};

const nativeCardSemantic = (cardValue: AgentCardValue): void => {
  nonEmpty(cardValue.name, "AgentCard.name");
  nonEmpty(cardValue.description, "AgentCard.description");
  nonEmpty(cardValue.version, "AgentCard.version");
  if (cardValue.supportedInterfaces.length === 0) malformed("AgentCard.supportedInterfaces");
  for (const interfaceValue of cardValue.supportedInterfaces) {
    nonEmpty(interfaceValue.url, "AgentInterface.url");
    nonEmpty(interfaceValue.protocolBinding, "AgentInterface.protocolBinding");
    if (interfaceValue.protocolVersion !== "1.0") malformed("AgentInterface.protocolVersion");
  }
  for (const skill of cardValue.skills) {
    nonEmpty(skill.id, "AgentSkill.id");
    nonEmpty(skill.name, "AgentSkill.name");
    nonEmpty(skill.description, "AgentSkill.description");
    if (skill.tags.length === 0) malformed("AgentSkill.tags");
  }
  for (const extension of cardValue.capabilities?.extensions ?? []) {
    nonEmpty(extension.uri, "AgentExtension.uri");
    nonEmpty(extension.description, "AgentExtension.description");
  }
};

/* eslint-disable consistent-return -- malformed always throws on rejected branches. */
const nativeStreamSemantic = (response: StreamResponseValue): void => {
  const payload = response.payload;
  if (!payload) return malformed("StreamResponse.payload");
  switch (payload.$case) {
    case "task":
      nativeTaskSemantic(payload.value);
      return;
    case "message":
      nativeMessageSemantic(payload.value);
      return;
    case "statusUpdate": {
      const update = payload.value;
      nonEmpty(update.taskId, "TaskStatusUpdateEvent.taskId");
      nonEmpty(update.contextId, "TaskStatusUpdateEvent.contextId");
      const status = update.status;
      if (!status || status.state === 0 || status.state === -1)
        return malformed("TaskStatusUpdateEvent.status.state");
      if (status.timestamp !== undefined)
        validTimestamp(status.timestamp, "TaskStatusUpdateEvent.status.timestamp");
      if (status.message) nativeMessageSemantic(status.message);
      return;
    }
    case "artifactUpdate": {
      const update = payload.value;
      nonEmpty(update.taskId, "TaskArtifactUpdateEvent.taskId");
      nonEmpty(update.contextId, "TaskArtifactUpdateEvent.contextId");
      const artifactValue = update.artifact;
      if (!artifactValue) return malformed("TaskArtifactUpdateEvent.artifact");
      nonEmpty(artifactValue.artifactId, "Artifact.artifactId");
      if (artifactValue.parts.length === 0) malformed("Artifact.parts");
      return;
    }
  }
};

const cardSemantic: SemanticCheck = (value) => {
  const input = objectRecord(value, "AgentCard");
  nonEmpty(input.name, "AgentCard.name");
  nonEmpty(input.description, "AgentCard.description");
  nonEmpty(input.version, "AgentCard.version");
  const interfaces = input.supportedInterfaces;
  if (!Array.isArray(interfaces) || interfaces.length === 0)
    malformed("AgentCard.supportedInterfaces");
  for (const item of interfaces as readonly FrozenJsonValue[]) {
    const interfaceValue = objectRecord(item, "AgentInterface");
    nonEmpty(interfaceValue.protocolBinding, "AgentInterface.protocolBinding");
    if (interfaceValue.protocolVersion !== "1.0") malformed("AgentInterface.protocolVersion");
    const interfaceUrl = interfaceValue.url;
    if (typeof interfaceUrl !== "string") return malformed("AgentInterface.url");
    try {
      const url = new URL(interfaceUrl);
      if (
        url.protocol !== "https:" &&
        !(url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname))
      )
        malformed("AgentInterface.url");
    } catch {
      malformed("AgentInterface.url");
    }
  }
};

// The codec, contract label, value and optional semantic validator are distinct inputs.
/* eslint-disable max-params -- registration keeps the two independent semantic stages explicit. */
const registerCodec = <T>(
  codec: MessageFns<T>,
  name: string,
  value: unknown,
  semantic?: SemanticCheck,
): A2ACanonicalJson => {
  const input = canonicalSnapshot(value, name);
  try {
    const output = canonicalSnapshot(codec.toJSON(codec.fromJSON(input)), name);
    if (canonicalize(input) !== canonicalize(output)) return malformed(name);
    semantic?.(output);
    return output;
  } catch (error) {
    if (error instanceof A2AContractError) throw error;
    return malformed(name);
  }
};

export const registerA2AAgentCard = (value: unknown) =>
  registerCodec(AgentCard, "AgentCard", value, cardSemantic);
export const registerA2AMessage = (value: unknown) =>
  registerCodec(Message, "Message", value, messageSemantic);
export const registerA2ATask = (value: unknown) => registerCodec(Task, "Task", value, taskSemantic);
export const registerA2ATaskStatusUpdate = (value: unknown) =>
  registerCodec(TaskStatusUpdateEvent, "TaskStatusUpdateEvent", value);
export const registerA2ATaskArtifactUpdate = (value: unknown) =>
  registerCodec(TaskArtifactUpdateEvent, "TaskArtifactUpdateEvent", value);
export const registerA2ASendMessageRequest = (value: unknown) =>
  registerCodec(SendMessageRequest, "SendMessageRequest", value, (request) => {
    const input = objectRecord(request, "SendMessageRequest");
    const requestMessage = input.message;
    if (requestMessage === undefined) return malformed("SendMessageRequest.message");
    messageSemantic(requestMessage);
  });
export const registerA2ASendMessageResponse = (value: unknown) =>
  registerCodec(SendMessageResponse, "SendMessageResponse", value);
export const registerA2AStreamResponse = (value: unknown) =>
  registerCodec(StreamResponse, "StreamResponse", value, streamSemantic);
export const registerA2AGetTaskRequest = (value: unknown) =>
  registerCodec(GetTaskRequest, "GetTaskRequest", value, idRequestSemantic("GetTaskRequest"));
export const registerA2AListTasksRequest = (value: unknown) =>
  registerCodec(ListTasksRequest, "ListTasksRequest", value, (request) => {
    const input = objectRecord(request, "ListTasksRequest");
    const pageSize = input.pageSize;
    if (
      pageSize !== undefined &&
      (typeof pageSize !== "number" ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100)
    )
      malformed("ListTasksRequest.pageSize");
  });
export const registerA2AListTasksResponse = (value: unknown) =>
  registerCodec(ListTasksResponse, "ListTasksResponse", value, (response) => {
    const input = objectRecord(response, "ListTasksResponse");
    if (!Array.isArray(input.tasks)) malformed("ListTasksResponse.tasks");
    for (const listedTask of input.tasks as readonly FrozenJsonValue[]) taskSemantic(listedTask);
  });
export const registerA2ACancelTaskRequest = (value: unknown) =>
  registerCodec(
    CancelTaskRequest,
    "CancelTaskRequest",
    value,
    idRequestSemantic("CancelTaskRequest"),
  );
export const registerA2ASubscribeToTaskRequest = (value: unknown) =>
  registerCodec(
    SubscribeToTaskRequest,
    "SubscribeToTaskRequest",
    value,
    idRequestSemantic("SubscribeToTaskRequest"),
  );
export const registerA2AGetExtendedAgentCardRequest = (value: unknown) =>
  registerCodec(GetExtendedAgentCardRequest, "GetExtendedAgentCardRequest", value);

const assertDataTree = (value: unknown, seen = new Set<object>()): void => {
  if (value === null || value === undefined || typeof value !== "object") return;
  if (nodeTypes.isProxy(value)) malformed("A2A native value");
  if (value instanceof Uint8Array) return;
  if (seen.has(value)) malformed("A2A native value");
  seen.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key === "symbol") malformed("A2A native value");
      const stringKey = key as string;
      if (Array.isArray(value) && stringKey === "length") continue;
      const descriptor = descriptors[stringKey];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
        malformed("A2A native value");
      assertDataTree((descriptor as PropertyDescriptor & { value: unknown }).value, seen);
    }
  } catch (error) {
    if (error instanceof A2AContractError) throw error;
    malformed("A2A native value");
  } finally {
    seen.delete(value);
  }
};
const detachNative = <T>(value: unknown): T => {
  assertDataTree(value);
  try {
    return structuredClone(value) as T;
  } catch {
    return malformed("A2A native value");
  }
};

const sameNative = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        rightKeys.includes(key) &&
        sameNative((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    )
  );
};

const freezeNative = <T>(value: T): Readonly<T> => {
  if (!value || typeof value !== "object" || value instanceof Uint8Array || Object.isFrozen(value))
    return value;
  for (const item of Object.values(value)) freezeNative(item);
  return Object.freeze(value);
};

// Native registration adds a pre-codec semantic validator to the codec contract inputs.
const registerNative = <T>(
  codec: MessageFns<T>,
  name: string,
  value: unknown,
  semantic?: SemanticCheck,
  nativeSemantic?: NativeSemanticCheck<T>,
): Readonly<T> => {
  const input = detachNative<T>(value);
  try {
    nativeSemantic?.(input);
    const decoded = codec.fromJSON(codec.toJSON(input));
    if (!sameNative(input, decoded)) malformed(name);
    registerCodec(codec, name, codec.toJSON(decoded), semantic);
    return freezeNative(decoded);
  } catch (error) {
    if (error instanceof A2AContractError) throw error;
    return malformed(name);
  }
};
/* eslint-enable max-params */

export const registerA2ANativeAgentCard = (value: unknown): Readonly<AgentCardValue> =>
  registerNative(AgentCard, "AgentCard", value, cardSemantic, nativeCardSemantic);
export const registerA2ANativeSendMessageRequest = (
  value: unknown,
): Readonly<SendMessageRequestValue> =>
  registerNative(
    SendMessageRequest,
    "SendMessageRequest",
    value,
    (request) => {
      const input = objectRecord(request, "SendMessageRequest");
      const requestMessage = input.message;
      if (requestMessage === undefined) return malformed("SendMessageRequest.message");
      messageSemantic(requestMessage);
    },
    (request) => {
      const requestMessage = request.message;
      if (!requestMessage) return malformed("SendMessageRequest.message");
      nativeMessageSemantic(requestMessage);
    },
  );
export const registerA2ANativeSendMessageResult = (value: unknown): Readonly<SendMessageResult> => {
  try {
    return registerNative(Task, "Task", value, taskSemantic, nativeTaskSemantic);
  } catch {
    return registerNative(Message, "Message", value, messageSemantic, nativeMessageSemantic);
  }
};
/* eslint-enable consistent-return */
export const registerA2ANativeStreamResponse = (value: unknown): Readonly<StreamResponseValue> =>
  registerNative(StreamResponse, "StreamResponse", value, streamSemantic, nativeStreamSemantic);
export const registerA2ANativeTask = (value: unknown): Readonly<TaskValue> =>
  registerNative(Task, "Task", value, taskSemantic, nativeTaskSemantic);
export const registerA2ANativeGetTaskRequest = (value: unknown): Readonly<GetTaskRequestValue> =>
  registerNative(GetTaskRequest, "GetTaskRequest", value, idRequestSemantic("GetTaskRequest"));
export const registerA2ANativeListTasksRequest = (
  value: unknown,
): Readonly<ListTasksRequestValue> =>
  registerNative(ListTasksRequest, "ListTasksRequest", value, (request) => {
    const input = objectRecord(request, "ListTasksRequest");
    const pageSize = input.pageSize;
    if (
      pageSize !== undefined &&
      (typeof pageSize !== "number" ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100)
    )
      malformed("ListTasksRequest.pageSize");
  });
export const registerA2ANativeListTasksResponse = (
  value: unknown,
): Readonly<ListTasksResponseValue> =>
  registerNative(
    ListTasksResponse,
    "ListTasksResponse",
    value,
    (response) => {
      const input = objectRecord(response, "ListTasksResponse");
      if (!Array.isArray(input.tasks)) malformed("ListTasksResponse.tasks");
      for (const listedTask of input.tasks as readonly FrozenJsonValue[]) taskSemantic(listedTask);
    },
    (response) => {
      if (response.pageSize < 1 || response.pageSize > 100) malformed("ListTasksResponse.pageSize");
      if (response.totalSize < 0) malformed("ListTasksResponse.totalSize");
      for (const listedTask of response.tasks) nativeTaskSemantic(listedTask);
    },
  );
export const registerA2ANativeCancelTaskRequest = (
  value: unknown,
): Readonly<CancelTaskRequestValue> =>
  registerNative(
    CancelTaskRequest,
    "CancelTaskRequest",
    value,
    idRequestSemantic("CancelTaskRequest"),
  );
export const registerA2ANativeSubscribeToTaskRequest = (
  value: unknown,
): Readonly<SubscribeToTaskRequestValue> =>
  registerNative(
    SubscribeToTaskRequest,
    "SubscribeToTaskRequest",
    value,
    idRequestSemantic("SubscribeToTaskRequest"),
  );

const exactKeys = (
  value: Record<string, FrozenJsonValue>,
  keys: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const actual = Object.keys(value);
  return (
    keys.every((key) => actual.includes(key)) &&
    actual.every((key) => keys.includes(key) || optional.includes(key))
  );
};

export interface A2AErrorStatus {
  readonly code: number;
  readonly status: string;
  readonly message: string;
  readonly details: readonly A2AErrorDetail[];
}

export interface A2AHttpErrorBody {
  readonly error: Readonly<A2AErrorStatus>;
}

export interface A2AErrorDetail {
  readonly "@type": "type.googleapis.com/google.rpc.ErrorInfo";
  readonly reason: string;
  readonly domain: "a2a-protocol.org";
  readonly metadata?: Readonly<Record<string, string>>;
}

export const registerA2AErrorStatus = (value: unknown): Readonly<A2AHttpErrorBody> => {
  const body = canonicalSnapshot(value, "google.rpc.Status");
  if (!record(body) || !exactKeys(body, ["error"])) {
    return malformed("google.rpc.Status");
  }
  const input = body.error;
  if (!record(input)) return malformed("google.rpc.Status");
  if (!exactKeys(input, ["code", "details", "message", "status"])) {
    return malformed("google.rpc.Status");
  }
  if (
    !Number.isInteger(input.code) ||
    typeof input.message !== "string" ||
    typeof input.status !== "string" ||
    !input.status ||
    !Array.isArray(input.details) ||
    input.details.length !== 1
  ) {
    return malformed("google.rpc.Status");
  }
  for (const detail of input.details) {
    if (!record(detail) || !exactKeys(detail, ["@type", "domain", "reason"], ["metadata"])) {
      return malformed("google.rpc.Status");
    }
    if (
      detail["@type"] !== "type.googleapis.com/google.rpc.ErrorInfo" ||
      detail.domain !== "a2a-protocol.org" ||
      typeof detail.reason !== "string" ||
      !detail.reason
    ) {
      return malformed("google.rpc.Status");
    }
    if (detail.metadata !== undefined) {
      if (
        !record(detail.metadata) ||
        Object.values(detail.metadata).some((item) => typeof item !== "string")
      ) {
        return malformed("google.rpc.Status");
      }
    }
  }
  return body as unknown as Readonly<A2AHttpErrorBody>;
};

export const unsupportedA2AOperation = (operation: string): never => {
  throw new A2AContractError(
    "unsupported-operation",
    `A2A 1.0 operation ${operation} is not exposed by this qualified surface.`,
  );
};
