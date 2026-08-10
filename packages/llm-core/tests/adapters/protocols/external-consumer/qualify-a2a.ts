import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AgentCard,
  A2A_OPERATIONS,
  A2A_PROTOCOL_VERSION,
  A2A_SDK_VERSION,
  Client,
  createA2AClient,
  Role,
  SendMessageRequest,
  StreamResponse,
  Task,
  TaskState,
} from "@geekist/llm-core/a2a";
import { DeleteTaskPushNotificationConfigRequest } from "@a2a-js/sdk";

const manifest = JSON.parse(
  readFileSync(join(import.meta.dir, "node_modules/@a2a-js/sdk/package.json"), "utf8"),
) as { name: string; version: string };
if (manifest.name !== "@a2a-js/sdk" || manifest.version !== "1.0.0") {
  throw new Error(`unexpected A2A SDK resolution ${manifest.name}@${manifest.version}`);
}
if (A2A_PROTOCOL_VERSION !== "1.0" || A2A_SDK_VERSION !== "1.0.0") {
  throw new Error("packed A2A authority constants do not match the fixture pins");
}
if (Role.ROLE_USER !== 1 || TaskState.TASK_STATE_COMPLETED !== 3) {
  throw new Error("packed A2A surface does not expose the qualified native enums");
}

const message = {
  messageId: "external-message-01",
  contextId: "external-context-01",
  role: "ROLE_USER",
  parts: [{ text: "hello", mediaType: "text/plain" }],
};
const task = {
  id: "external-task-01",
  contextId: "external-context-01",
  status: {
    state: "TASK_STATE_COMPLETED",
    timestamp: "2026-08-09T00:00:00Z",
  },
  history: [message],
};
const nativeCard = AgentCard.fromJSON({
  name: "External consumer agent",
  description: "Packed A2A qualification",
  supportedInterfaces: [
    {
      url: "https://agent.example.test/a2a",
      protocolBinding: "HTTP+JSON",
      protocolVersion: "1.0",
    },
  ],
  version: "1.0.0",
  capabilities: {},
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [],
});
const nativeTask = Task.fromJSON(task);
const stream = async function* () {
  yield StreamResponse.fromJSON({ task });
};
const sdkClient = new Client(
  {
    protocolName: "HTTP+JSON",
    protocolVersion: "1.0",
    getExtendedAgentCard: async () => nativeCard,
    sendMessage: async () => nativeTask,
    sendMessageStream: stream,
    createTaskPushNotificationConfig: async (request) => request,
    getTaskPushNotificationConfig: async () => {
      throw new Error("not exercised");
    },
    listTaskPushNotificationConfig: async () => ({ configs: [], nextPageToken: "" }),
    deleteTaskPushNotificationConfig: async () => undefined,
    getTask: async () => nativeTask,
    listTasks: async () => ({
      tasks: [nativeTask],
      nextPageToken: "",
      pageSize: 1,
      totalSize: 1,
    }),
    cancelTask: async () => nativeTask,
    resubscribeTask: stream,
  },
  nativeCard,
);
const client = createA2AClient(sdkClient, nativeCard);

const response = await client.sendMessage(SendMessageRequest.fromJSON({ message }));
if (
  !("id" in response) ||
  response.id !== "external-task-01" ||
  response.history?.[0]?.messageId !== "external-message-01"
) {
  throw new Error("packed A2A surface did not preserve native identity");
}
if (
  !A2A_OPERATIONS.some(
    ({ operation, support }) => operation === "native.a2a.message.send" && support === "supported",
  )
) {
  throw new Error("packed A2A operation matrix omitted native message send");
}
try {
  await client.deleteTaskPushNotificationConfig(
    DeleteTaskPushNotificationConfigRequest.fromJSON({ taskId: "external-task-01" }),
  );
  throw new Error("packed A2A surface accepted unsupported push notifications");
} catch (error) {
  if (!(error instanceof TypeError)) throw error;
}

console.log("Packed A2A 1.0 consumer qualification passed.");
