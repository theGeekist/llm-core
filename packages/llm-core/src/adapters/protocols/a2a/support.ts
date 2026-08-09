export const A2A_SPECIFICATION_VERSION = "1.0.0" as const;
export const A2A_PROTOCOL_VERSION = "1.0" as const;
export const A2A_SDK_VERSION = "1.0.0" as const;

export type A2AOperationSupport = "supported" | "unsupported" | "not-applicable";

export interface A2AOperationDeclaration {
  readonly operation: string;
  readonly support: A2AOperationSupport;
  readonly contract: string;
  readonly fixture: string;
}

const clientFixture = "packages/llm-core/tests/adapters/protocols/a2a/a2a-client.test.ts";
const validationFixture = "packages/llm-core/tests/adapters/protocols/a2a/a2a-validation.test.ts";

const operations = [
  {
    operation: "native.a2a.agent-card.basic",
    support: "supported",
    contract: "A2A 1.0 AgentCard canonical JSON",
    fixture: `${clientFixture}#discovers and validates an A2A Agent Card`,
  },
  {
    operation: "native.a2a.agent-card.extended",
    support: "supported",
    contract: "A2A 1.0 GetExtendedAgentCard and AgentCard canonical JSON",
    fixture: `${clientFixture}#requests an extended Agent Card`,
  },
  {
    operation: "native.a2a.message.send",
    support: "supported",
    contract: "A2A 1.0 SendMessageRequest and native Message or Task result",
    fixture: `${clientFixture}#preserves native message task and artifact identity`,
  },
  {
    operation: "native.a2a.message.stream",
    support: "supported",
    contract: "A2A 1.0 SendMessageRequest and ordered StreamResponse canonical JSON",
    fixture: `${clientFixture}#validates every streaming response`,
  },
  {
    operation: "native.a2a.task.get-list-cancel",
    support: "supported",
    contract: "A2A 1.0 task request response and cancellation contracts",
    fixture: `${clientFixture}#preserves native retrieval listing and cancellation`,
  },
  {
    operation: "native.a2a.task.subscribe",
    support: "supported",
    contract: "A2A 1.0 SubscribeToTaskRequest and ordered StreamResponse canonical JSON",
    fixture: `${clientFixture}#validates every subscription response`,
  },
  {
    operation: "native.a2a.extensions.negotiation",
    support: "supported",
    contract: "A2A 1.0 AgentExtension declarations and SDK RequestOptions service parameters",
    fixture: `${clientFixture}#negotiates declared extensions and rejects missing or unsupported URIs`,
  },
  {
    operation: "native.a2a.extensions.field-preservation",
    support: "supported",
    contract: "A2A 1.0 AgentExtension and Message extension fields",
    fixture: `${validationFixture}#retains extension fields exactly`,
  },
  {
    operation: "native.a2a.error.http-json.a2a-error-info-only-status",
    support: "supported",
    contract: "A2A 1.0 HTTP+JSON RestErrorBody containing exactly one A2A ErrorInfo detail",
    fixture: `${validationFixture}#accepts a closed A2A error and rejects leaked data`,
  },
  {
    operation: "native.a2a.push-notification.create",
    support: "unsupported",
    contract: "createTaskPushNotificationConfig fails explicitly",
    fixture: `${clientFixture}#fails each unsupported push-notification method explicitly`,
  },
  {
    operation: "native.a2a.push-notification.get",
    support: "unsupported",
    contract: "getTaskPushNotificationConfig fails explicitly",
    fixture: `${clientFixture}#fails each unsupported push-notification method explicitly`,
  },
  {
    operation: "native.a2a.push-notification.list",
    support: "unsupported",
    contract: "listTaskPushNotificationConfig fails explicitly",
    fixture: `${clientFixture}#fails each unsupported push-notification method explicitly`,
  },
  {
    operation: "native.a2a.push-notification.delete",
    support: "unsupported",
    contract: "deleteTaskPushNotificationConfig fails explicitly",
    fixture: `${clientFixture}#fails each unsupported push-notification method explicitly`,
  },
  {
    operation: "portable.agent-runner.projection",
    support: "unsupported",
    contract: "A2A task delegation event and failure semantics have no exact AgentRunner mapping",
    fixture: `${clientFixture}#does not expose a portable AgentRunner projection`,
  },
  {
    operation: "native.a2a.simple-chat.channel-extension",
    support: "unsupported",
    contract: "Application-owned channel behaviour is outside the A2A protocol surface",
    fixture: `${validationFixture}#rejects undeclared application channel fields`,
  },
] as const satisfies readonly A2AOperationDeclaration[];

export const A2A_OPERATIONS = Object.freeze(
  operations.map((operation) => Object.freeze(operation)),
) as unknown as typeof operations;

export type A2AOperation = (typeof A2A_OPERATIONS)[number]["operation"];
