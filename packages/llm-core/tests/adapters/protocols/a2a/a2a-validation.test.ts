import { describe, expect, test } from "bun:test";
import {
  A2AContractError,
  AgentCard,
  ListTasksResponse,
  Task,
  registerA2AAgentCard,
  registerA2AErrorStatus,
  registerA2AGetTaskRequest,
  registerA2AListTasksRequest,
  registerA2AMessage,
  registerA2ANativeAgentCard,
  registerA2ANativeListTasksResponse,
  registerA2ANativeTask,
  registerA2ASendMessageRequest,
  registerA2AStreamResponse,
  registerA2ATask,
} from "../../../../src/adapters/protocols/a2a/public";
import { card, message, sendRequest, task } from "./fixtures";

describe("A2A 1.0 closed native validation", () => {
  test("preserves native identity task message artifact and extension facts", () => {
    expect(registerA2AAgentCard(card)).toEqual(card);
    expect(registerA2AMessage(message)).toEqual(message);
    expect(registerA2ATask(task)).toEqual(task);
    expect(registerA2ASendMessageRequest(sendRequest)).toEqual(sendRequest);
  });

  test("rejects undeclared fields instead of silently projecting them", () => {
    expect(() => registerA2AMessage({ ...message, providerState: { secret: true } })).toThrow(
      A2AContractError,
    );
    expect(() => registerA2ATask({ ...task, portableStatus: "completed" })).toThrow(
      A2AContractError,
    );
    expect(() => registerA2AAgentCard({ ...card, channelMembership: ["member-1"] })).toThrow(
      A2AContractError,
    );
    expect(() => registerA2AStreamResponse({ task, nativeEvent: { secret: true } })).toThrow(
      A2AContractError,
    );
  });

  test("rejects hostile accessors without reading them", () => {
    let reads = 0;
    const hostile = Object.defineProperty({}, "messageId", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "message-hostile";
      },
    });
    expect(() => registerA2AMessage(hostile)).toThrow(A2AContractError);
    expect(reads).toBe(0);
  });

  test("rejects root and nested native proxies without executing any traps", () => {
    type TrapCalls = Record<
      "get" | "getPrototypeOf" | "ownKeys" | "getOwnPropertyDescriptor",
      number
    >;
    const calls = (): TrapCalls => ({
      get: 0,
      getPrototypeOf: 0,
      ownKeys: 0,
      getOwnPropertyDescriptor: 0,
    });
    const hostileProxy = <T extends object>(target: T, trapCalls: TrapCalls): T =>
      new Proxy(target, {
        get: () => {
          trapCalls.get += 1;
          throw new Error("provider-secret:get");
        },
        getPrototypeOf: () => {
          trapCalls.getPrototypeOf += 1;
          throw new Error("provider-secret:getPrototypeOf");
        },
        ownKeys: () => {
          trapCalls.ownKeys += 1;
          throw new Error("provider-secret:ownKeys");
        },
        getOwnPropertyDescriptor: () => {
          trapCalls.getOwnPropertyDescriptor += 1;
          throw new Error("provider-secret:getOwnPropertyDescriptor");
        },
      });
    const rejectsClosed = (value: unknown): void => {
      try {
        registerA2ANativeTask(value);
        throw new Error("proxy accepted");
      } catch (error) {
        expect(error).toBeInstanceOf(A2AContractError);
        expect((error as Error).message).not.toContain("provider-secret");
      }
    };

    const rootCalls = calls();
    rejectsClosed(hostileProxy(Task.fromJSON(task), rootCalls));
    expect(rootCalls).toEqual(calls());

    const nestedCalls = calls();
    const nestedProxy = Task.fromJSON(task);
    nestedProxy.status = hostileProxy(nestedProxy.status!, nestedCalls);
    rejectsClosed(nestedProxy);
    expect(nestedCalls).toEqual(calls());
  });

  test("retains extension fields exactly", () => {
    const registered = registerA2AMessage(message) as typeof message;
    expect(registered.extensions).toEqual(["urn:example:a2a:extension:v1"]);
    expect((registerA2AAgentCard(card) as typeof card).capabilities.extensions[0]?.params).toEqual({
      mode: "native",
    });
  });

  test("accepts a closed A2A error and rejects leaked data", () => {
    const status = {
      error: {
        code: 5,
        status: "NOT_FOUND",
        message: "Task not found",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "TASK_NOT_FOUND",
            domain: "a2a-protocol.org",
            metadata: { taskId: "task-01" },
          },
        ],
      },
    } as const;
    expect(registerA2AErrorStatus(status)).toEqual(status);
    expect(() =>
      registerA2AErrorStatus({ error: { ...status.error, credentials: "leaked" } }),
    ).toThrow(A2AContractError);
    expect(() =>
      registerA2AErrorStatus({
        error: {
          ...status.error,
          details: [{ "@type": "type.googleapis.com/google.rpc.DebugInfo", detail: "debug" }],
        },
      }),
    ).toThrow(A2AContractError);
  });

  test("rejects undeclared application channel fields", () => {
    expect(() =>
      registerA2ASendMessageRequest({
        ...sendRequest,
        channel: { membership: ["agent-1"], deliveryLease: "lease-1" },
      }),
    ).toThrow(A2AContractError);
  });

  test("rejects invalid pagination timestamps URLs and identifiers", () => {
    for (const pageSize of [-1, 0, 101]) {
      expect(() =>
        registerA2AListTasksRequest({
          tenant: "tenant-01",
          contextId: "context-01",
          status: "TASK_STATE_COMPLETED",
          pageSize,
        }),
      ).toThrow(A2AContractError);
    }
    expect(() =>
      registerA2ATask({
        ...task,
        status: { ...task.status, timestamp: "2026-02-30T00:00:00Z" },
      }),
    ).toThrow(A2AContractError);
    expect(() =>
      registerA2AAgentCard({
        ...card,
        supportedInterfaces: [{ ...card.supportedInterfaces[0], url: "not a URL" }],
      }),
    ).toThrow(A2AContractError);
    expect(() => registerA2AMessage({ ...message, messageId: "" })).toThrow(A2AContractError);
    expect(() => registerA2AGetTaskRequest({ tenant: "tenant-01", id: "" })).toThrow(
      A2AContractError,
    );
    expect(() =>
      registerA2AStreamResponse({
        statusUpdate: {
          taskId: "task-01",
          contextId: "context-01",
          status: { state: "TASK_STATE_WORKING", timestamp: "not-a-timestamp" },
        },
      }),
    ).toThrow(A2AContractError);
  });

  test("accepts only real canonical protobuf timestamp instants", () => {
    for (const timestamp of [
      "0001-01-01T00:00:00Z",
      "2000-02-29T23:59:59.000Z",
      "2026-08-09T00:00:00.123456Z",
      "2026-08-09T00:00:00.123456789Z",
      "9999-12-31T23:59:59.999Z",
    ]) {
      expect(registerA2ATask({ ...task, status: { ...task.status, timestamp } })).toMatchObject({
        status: { timestamp },
      });
    }
    for (const timestamp of [
      "0000-01-01T00:00:00Z",
      "2025-02-29T00:00:00Z",
      "2026-02-30T00:00:00Z",
      "2026-04-31T00:00:00Z",
      "2026-12-31T24:00:00Z",
      "2026-12-31T23:60:00Z",
      "2026-12-31T23:59:60Z",
      "2026-08-09T00:00:00.1Z",
      "2026-08-09T00:00:00.1234Z",
      "10000-01-01T00:00:00Z",
    ]) {
      expect(() => registerA2ATask({ ...task, status: { ...task.status, timestamp } })).toThrow(
        A2AContractError,
      );
    }
  });

  test("rejects invalid nested SDK-native facts before codec omission", () => {
    const badHistory = Task.fromJSON(task);
    badHistory.history[0]!.messageId = "";
    expect(() => registerA2ANativeTask(badHistory)).toThrow(A2AContractError);

    const badArtifact = Task.fromJSON(task);
    badArtifact.artifacts[0]!.artifactId = "";
    expect(() => registerA2ANativeTask(badArtifact)).toThrow(A2AContractError);

    const badSkill = AgentCard.fromJSON(card);
    badSkill.skills[0]!.id = "";
    expect(() => registerA2ANativeAgentCard(badSkill)).toThrow(A2AContractError);

    for (const response of [
      ListTasksResponse.fromJSON({ tasks: [task], pageSize: 0, totalSize: 1 }),
      ListTasksResponse.fromJSON({ tasks: [task], pageSize: 1, totalSize: -1 }),
    ]) {
      expect(() => registerA2ANativeListTasksResponse(response)).toThrow(A2AContractError);
    }
  });
});
