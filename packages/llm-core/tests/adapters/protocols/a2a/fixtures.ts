import {
  AgentCard,
  Message,
  SendMessageRequest,
  StreamResponse,
  Task,
  type Transport,
} from "../../../../src/adapters/protocols/a2a/public";

export const message = {
  messageId: "message-01",
  contextId: "context-01",
  role: "ROLE_USER",
  parts: [{ text: "hello", mediaType: "text/plain" }],
  extensions: ["urn:example:a2a:extension:v1"],
  metadata: { trace: "native-a2a" },
};

export const artifact = {
  artifactId: "artifact-01",
  name: "answer",
  description: "A native A2A artifact",
  parts: [{ text: "world", mediaType: "text/plain" }],
  extensions: ["urn:example:a2a:extension:v1"],
  metadata: { provenance: "remote-agent" },
};

export const task = {
  id: "task-01",
  contextId: "context-01",
  status: {
    state: "TASK_STATE_COMPLETED",
    message: {
      messageId: "message-02",
      contextId: "context-01",
      taskId: "task-01",
      role: "ROLE_AGENT",
      parts: [{ text: "complete", mediaType: "text/plain" }],
    },
    timestamp: "2026-08-09T00:00:00Z",
  },
  artifacts: [artifact],
  history: [message],
  metadata: { delegatedBy: "remote-agent-01" },
};

export const card = {
  name: "Qualified remote agent",
  description: "Exercises the exact A2A 1.0 surface",
  supportedInterfaces: [
    {
      url: "https://agent.example.test/a2a",
      protocolBinding: "HTTP+JSON",
      protocolVersion: "1.0",
    },
  ],
  provider: { organization: "Example", url: "https://example.test" },
  version: "2026.8.9",
  documentationUrl: "https://agent.example.test/docs",
  capabilities: {
    streaming: true,
    extendedAgentCard: true,
    extensions: [
      {
        uri: "urn:example:a2a:extension:v1",
        description: "Qualified example extension",
        params: { mode: "native" },
      },
    ],
  },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "echo",
      name: "Echo",
      description: "Echo a text part",
      tags: ["echo"],
      examples: ["hello"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
  ],
  iconUrl: "https://agent.example.test/icon.png",
};

export const sendRequest = {
  message,
  configuration: {
    acceptedOutputModes: ["text/plain"],
    historyLength: 10,
  },
  metadata: { requestOwner: "caller" },
};

const stream = async function* <T>(values: readonly T[]): AsyncGenerator<T, void, undefined> {
  for (const value of values) yield value;
};

export const nativeCard = AgentCard.fromJSON(card);
export const nativeMessage = Message.fromJSON(message);
export const nativeTask = Task.fromJSON(task);
export const nativeSendRequest = SendMessageRequest.fromJSON(sendRequest);

export const transportFixture = (capture?: { options?: unknown }): Transport => ({
  protocolName: "HTTP+JSON",
  protocolVersion: "1.0",
  getExtendedAgentCard: async (_request, options) => {
    if (capture) capture.options = options;
    return nativeCard;
  },
  sendMessage: async (_request, options) => {
    if (capture) capture.options = options;
    return nativeTask;
  },
  sendMessageStream: () =>
    stream([
      StreamResponse.fromJSON({ task }),
      StreamResponse.fromJSON({
        statusUpdate: {
          taskId: task.id,
          contextId: task.contextId,
          status: task.status,
          metadata: { generation: 1 },
        },
      }),
      StreamResponse.fromJSON({
        artifactUpdate: {
          taskId: task.id,
          contextId: task.contextId,
          artifact,
          lastChunk: true,
        },
      }),
    ]),
  createTaskPushNotificationConfig: async (request) => request,
  getTaskPushNotificationConfig: async () => {
    throw new Error("not called");
  },
  listTaskPushNotificationConfig: async () => ({ configs: [], nextPageToken: "" }),
  deleteTaskPushNotificationConfig: async () => undefined,
  getTask: async () => nativeTask,
  listTasks: async () => ({ tasks: [nativeTask], nextPageToken: "", pageSize: 1, totalSize: 1 }),
  cancelTask: async () =>
    Task.fromJSON({
      ...task,
      status: { state: "TASK_STATE_CANCELED", timestamp: "2026-08-09T00:01:00Z" },
    }),
  resubscribeTask: () => stream([StreamResponse.fromJSON({ task })]),
});
