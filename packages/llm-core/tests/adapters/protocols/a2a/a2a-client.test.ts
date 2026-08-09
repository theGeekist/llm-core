import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  A2AContractError,
  A2A_OPERATIONS,
  A2A_PROTOCOL_VERSION,
  A2A_SDK_VERSION,
  A2A_SPECIFICATION_VERSION,
  AgentCard,
  CancelTaskRequest,
  Client,
  GetTaskRequest,
  ListTasksRequest,
  ServiceParameters,
  SubscribeToTaskRequest,
  createA2AClient,
  withA2AExtensions,
  type RequestOptions,
} from "../../../../src/adapters/protocols/a2a/public";
import {
  card,
  nativeCard,
  nativeMessage,
  nativeSendRequest,
  nativeTask,
  task,
  transportFixture,
} from "./fixtures";

const clientFixture = (agentCard = nativeCard, capture?: { options?: unknown }) =>
  createA2AClient(new Client(transportFixture(capture), agentCard), agentCard);

describe("qualified A2A client boundary", () => {
  test("declares immutable exact authority and resolvable operation evidence", async () => {
    expect([A2A_PROTOCOL_VERSION, A2A_SPECIFICATION_VERSION, A2A_SDK_VERSION]).toEqual([
      "1.0",
      "1.0.0",
      "1.0.0",
    ]);
    expect(Object.isFrozen(A2A_OPERATIONS)).toBe(true);
    expect(A2A_OPERATIONS.every(Object.isFrozen)).toBe(true);
    expect(() => Object.assign(A2A_OPERATIONS[0], { support: "unsupported" })).toThrow();
    for (const operation of A2A_OPERATIONS) {
      const separator = operation.fixture.lastIndexOf("#");
      expect(separator).toBeGreaterThan(0);
      const fixturePath = operation.fixture.slice(0, separator);
      const anchor = operation.fixture.slice(separator + 1);
      const source = await Bun.file(
        resolve(import.meta.dir, "../../../../../..", fixturePath),
      ).text();
      expect(source.includes(`test("${anchor}"`), operation.operation).toBe(true);
    }
  });

  test("discovers and validates an A2A Agent Card", async () => {
    const discovered = await clientFixture().getAgentCard();
    expect(discovered.name).toBe(card.name);
    expect(discovered.supportedInterfaces[0]?.protocolVersion).toBe("1.0");
    expect(Object.isFrozen(discovered)).toBe(true);
    expect(Object.isFrozen(discovered.supportedInterfaces)).toBe(true);
  });

  test("requests an extended Agent Card", async () => {
    const transport = transportFixture();
    const getExtendedAgentCard = transport.getExtendedAgentCard;
    let requests = 0;
    transport.getExtendedAgentCard = async (request, options) => {
      requests += 1;
      return getExtendedAgentCard(request, options);
    };
    const extended = await createA2AClient(
      new Client(transport, nativeCard),
      nativeCard,
    ).getAgentCard();
    expect(requests).toBe(1);
    expect(extended.capabilities?.extendedAgentCard).toBe(true);
    expect(extended.capabilities?.extensions[0]?.uri).toBe("urn:example:a2a:extension:v1");
  });

  test("preserves native message task and artifact identity", async () => {
    const client = clientFixture();
    expect(client.protocolVersion).toBe("1.0");
    const result = await client.sendMessage(nativeSendRequest);
    if (!("id" in result)) throw new Error("Expected native A2A task result.");
    expect(result.id).toBe("task-01");
    expect(result.contextId).toBe("context-01");
    expect(result.status?.message?.messageId).toBe("message-02");
    expect(result.artifacts[0]?.artifactId).toBe("artifact-01");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.status)).toBe(true);

    const directTransport = transportFixture();
    directTransport.sendMessage = async () => nativeMessage;
    const direct = await createA2AClient(
      new Client(directTransport, nativeCard),
      nativeCard,
    ).sendMessage(nativeSendRequest);
    if (!("messageId" in direct)) throw new Error("Expected native A2A message result.");
    expect(direct.messageId).toBe("message-01");
    expect(direct.parts[0]?.content?.$case).toBe("text");
    expect(Object.isFrozen(direct)).toBe(true);
  });

  test("validates every streaming response", async () => {
    const sent = [];
    for await (const value of clientFixture().sendMessageStream(nativeSendRequest))
      sent.push(value);
    expect(sent).toHaveLength(3);
    expect(sent.map((item) => item.payload?.$case)).toEqual([
      "task",
      "statusUpdate",
      "artifactUpdate",
    ]);
    expect(sent[1]?.payload?.$case).toBe("statusUpdate");
    expect(sent.every(Object.isFrozen)).toBe(true);
  });

  test("validates every subscription response", async () => {
    const resumed = [];
    for await (const value of clientFixture().resubscribeTask(
      SubscribeToTaskRequest.fromJSON({ tenant: "tenant-01", id: "task-01" }),
    ))
      resumed.push(value);
    expect(resumed).toHaveLength(1);
    expect(resumed[0]?.payload?.$case).toBe("task");
    const payload = resumed[0]?.payload;
    if (payload?.$case !== "task") throw new Error("Expected native A2A task subscription.");
    expect(payload.value.id).toBe("task-01");
    expect(Object.isFrozen(resumed[0])).toBe(true);
  });

  test("preserves native retrieval listing and cancellation", async () => {
    const client = clientFixture();
    expect(
      (await client.getTask(GetTaskRequest.fromJSON({ tenant: "tenant-01", id: "task-01" }))).id,
    ).toBe(task.id);
    expect(
      (
        await client.listTasks(
          ListTasksRequest.fromJSON({
            tenant: "tenant-01",
            contextId: "context-01",
            status: 3,
            pageSize: 1,
          }),
        )
      ).tasks[0]?.id,
    ).toBe(task.id);
    expect(
      (await client.cancelTask(CancelTaskRequest.fromJSON({ tenant: "tenant-01", id: "task-01" })))
        .status?.state,
    ).toBe(5);
  });

  test("negotiates declared extensions and rejects missing or unsupported URIs", async () => {
    const capture: { options?: unknown } = {};
    const controller = new AbortController();
    const contextKey = Symbol("request-context");
    const options = {
      signal: controller.signal,
      context: { [contextKey]: "context-value" },
      serviceParameters: ServiceParameters.create(
        withA2AExtensions("urn:example:a2a:extension:v1"),
      ),
    };
    await clientFixture(nativeCard, capture).sendMessage(nativeSendRequest, options);
    expect(capture.options).toEqual({
      signal: controller.signal,
      context: { [contextKey]: "context-value" },
      serviceParameters: {
        "A2A-Version": "1.0",
        "A2A-Extensions": "urn:example:a2a:extension:v1",
      },
    });
    expect((capture.options as RequestOptions).context).not.toBe(options.context);
    expect(Object.isFrozen((capture.options as RequestOptions).context)).toBe(true);

    const requiredCard = AgentCard.fromJSON({
      ...card,
      capabilities: {
        ...card.capabilities,
        extensions: [{ ...card.capabilities.extensions[0], required: true }],
      },
    });
    expect(() => clientFixture(requiredCard).sendMessage(nativeSendRequest)).toThrow(
      /Required A2A extension/,
    );
    expect(() =>
      clientFixture().sendMessage(nativeSendRequest, {
        serviceParameters: ServiceParameters.create(withA2AExtensions("urn:unsupported")),
      }),
    ).toThrow(/not declared/);
  });

  test("fails each unsupported push-notification method explicitly", () => {
    const client = clientFixture();
    const create = () => client.createTaskPushNotificationConfig({} as never);
    const get = () => client.getTaskPushNotificationConfig({} as never);
    const list = () => client.listTaskPushNotificationConfig({} as never);
    const remove = () => client.deleteTaskPushNotificationConfig({} as never);
    for (const invoke of [create, get, list, remove]) expect(invoke).toThrow(A2AContractError);
  });

  test("does not expose a portable AgentRunner projection", () => {
    expect((clientFixture() as unknown as Record<string, unknown>).agentRunner).toBeUndefined();
    expect(
      A2A_OPERATIONS.find((item) => item.operation === "portable.agent-runner.projection")?.support,
    ).toBe("unsupported");
  });

  test("rejects a hostile native transport result before reading accessors", async () => {
    let reads = 0;
    const hostile = Object.defineProperty({}, "id", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "task-hostile";
      },
    });
    const transport = transportFixture();
    transport.getTask = async () => hostile as typeof nativeTask;
    await expect(
      createA2AClient(new Client(transport, nativeCard), nativeCard).getTask(
        GetTaskRequest.fromJSON({ tenant: "tenant-01", id: "task-01" }),
      ),
    ).rejects.toBeInstanceOf(A2AContractError);
    expect(reads).toBe(0);
  });

  test("rejects accessor-backed options with zero reads across every client operation", async () => {
    let reads = 0;
    const hostile = Object.defineProperty({}, "signal", {
      enumerable: true,
      get: () => {
        reads += 1;
        return undefined;
      },
    }) as RequestOptions;
    const client = clientFixture();
    const asyncCalls = [
      () => client.getAgentCard(hostile),
      () => client.sendMessage(nativeSendRequest, hostile),
      () => client.getTask(GetTaskRequest.fromJSON({ id: "task-01" }), hostile),
      () =>
        client.listTasks(
          ListTasksRequest.fromJSON({ contextId: "context-01", pageSize: 1 }),
          hostile,
        ),
      () => client.cancelTask(CancelTaskRequest.fromJSON({ id: "task-01" }), hostile),
    ];
    for (const invoke of asyncCalls)
      await expect(invoke()).rejects.toBeInstanceOf(A2AContractError);

    expect(() => client.sendMessageStream(nativeSendRequest, hostile)).toThrow(A2AContractError);
    expect(() =>
      client.resubscribeTask(SubscribeToTaskRequest.fromJSON({ id: "task-01" }), hostile),
    ).toThrow(A2AContractError);
    expect(() => client.createTaskPushNotificationConfig({} as never, hostile)).toThrow(
      A2AContractError,
    );
    expect(() => client.getTaskPushNotificationConfig({} as never, hostile)).toThrow(
      A2AContractError,
    );
    expect(() => client.listTaskPushNotificationConfig({} as never, hostile)).toThrow(
      A2AContractError,
    );
    expect(() => client.deleteTaskPushNotificationConfig({} as never, hostile)).toThrow(
      A2AContractError,
    );
    expect(reads).toBe(0);
  });
});
