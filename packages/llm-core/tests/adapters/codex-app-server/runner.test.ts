import { describe, expect, test } from "bun:test";
import {
  contractVersion,
  externalId,
  newCoreId,
  type ConversationId,
  type CorrelationId,
  type EventId,
  type PrincipalId,
  type RunId,
} from "#contracts";
import { admitAgentActiveInput } from "../../../src/agent/runtime";
import {
  CODEX_APP_SERVER_VERSION,
  codexAppServerConversationProfile,
  createCodexAppServerRunner,
  type CodexAppServerClient,
  type CodexAppServerNotification,
  type CodexAppServerRequest,
} from "../../../src/adapters/codex-app-server/public";
import type { JsonValue } from "#contracts";

const NOW = "2026-08-27T10:00:00.000Z";
const RUN_ID = newCoreId<RunId>("0198f0f4-8c5b-7a91-8c3b-123456789d01");
const EVENT_ID = newCoreId<EventId>("0198f0f4-8c5b-7a91-8c3b-123456789d02");
const CONVERSATION_ID = newCoreId<ConversationId>("0198f0f4-8c5b-7a91-8c3b-123456789d04");

const fixtureClient = (
  notifications: readonly CodexAppServerNotification[],
): { readonly client: CodexAppServerClient; readonly requests: CodexAppServerRequest[] } => {
  const requests: CodexAppServerRequest[] = [];
  const client: CodexAppServerClient = {
    request: (request): JsonValue => {
      requests.push(request);
      if (request.method === "thread/start" || request.method === "thread/resume") {
        return { thread: { id: String(request.params.threadId ?? "thread:one") } };
      }
      if (request.method === "turn/start") return { turn: { id: "turn:one" } };
      if (request.method === "turn/steer") return { turnId: "turn:one" };
      return {};
    },
    notifications: async function* () {
      yield* notifications;
    },
  };
  return { client, requests };
};

const runnerWith = (client: CodexAppServerClient) =>
  createCodexAppServerRunner({
    client,
    identity: { runId: () => RUN_ID, eventId: () => EVENT_ID, now: () => NOW },
    output: {
      projectAgentText: ({ text }) => text.replaceAll("secret", "[redacted]"),
    },
  });

const preparedRequest = async (
  runner: ReturnType<typeof runnerWith>,
  providerSession?: JsonValue,
) => ({
  agent: await runner.prepare({
    agentId: "agent.codex-test",
    version: contractVersion("1.0.0"),
    instructions: "Exercise the app-server adapter.",
    effectRequirement: "read-only" as const,
  }),
  invocationContext: { invocationId: "0198f0f4-8c5b-7a91-8c3b-123456789d03" as never },
  input: { kind: "text", text: "Return fixture output." },
  ...(providerSession ? { providerSession: providerSession as never } : {}),
});

describe("Codex app-server native conversation adapter", () => {
  test("pins the exact coordinator-owned route and complete portable operation matrix", async () => {
    const { client } = fixtureClient([]);
    const capabilities = await runnerWith(client).capabilities();

    expect(CODEX_APP_SERVER_VERSION).toBe("0.147.0");
    expect(capabilities.nativeConversation).toBe(codexAppServerConversationProfile);
    expect(
      capabilities.nativeConversation.operations.map(({ disposition }) => disposition),
    ).toEqual(["supported", "supported", "supported", "supported", "supported"]);
    expect(capabilities.nativeConversation.operations[3]).toEqual(
      expect.objectContaining({ deliveryMode: "native-live" }),
    );
    expect(capabilities.controlledEffects).toBe(false);
  });

  test("starts a thread and turn, exposes early provider identity and projects terminal output", async () => {
    const { client, requests } = fixtureClient([
      {
        method: "item/agentMessage/delta",
        params: {
          threadId: "thread:one",
          turnId: "turn:one",
          itemId: "item:one",
          delta: "secret done",
        },
      },
      {
        method: "turn/completed",
        params: {
          threadId: "thread:one",
          turnId: "turn:one",
          turn: { id: "turn:one", status: "completed" },
        },
      },
    ]);
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner));

    expect(await run.providerSession()).toEqual({
      kind: "provider-session-ref",
      providerId: "provider.codex",
      sessionId: "thread:one",
    } as never);
    expect(await run.result()).toEqual(
      expect.objectContaining({
        status: "completed",
        output: { kind: "text", text: "[redacted] done" },
      }),
    );
    const events = [];
    for await (const event of run.events()) events.push(event.kind);
    expect(events).toEqual(["agent.run.started", "agent.run.completed"]);
    expect(requests.map(({ method }) => method)).toEqual(["thread/start", "turn/start"]);
    expect(requests[1]?.params.input).toEqual([
      {
        type: "text",
        text: '{"kind":"text","text":"Return fixture output."}',
        text_elements: [],
      },
    ]);
  });

  test("continues only the exact stored Codex thread and keeps cancellation distinct", async () => {
    const { client, requests } = fixtureClient([
      {
        method: "turn/completed",
        params: {
          threadId: "thread:stored",
          turnId: "turn:one",
          turn: { id: "turn:one", status: "interrupted" },
        },
      },
    ]);
    const runner = runnerWith(client);
    const run = await runner.start(
      await preparedRequest(runner, {
        kind: "provider-session-ref",
        providerId: "provider.codex",
        sessionId: "thread:stored",
      }),
    );

    expect(requests[0]).toEqual({ method: "thread/resume", params: { threadId: "thread:stored" } });
    expect((await run.result()).status).toBe("cancelled");
    expect(requests.some(({ method }) => method === "turn/steer")).toBe(false);
  });

  test("steers the existing turn without cancellation and rejects duplicate input identity", async () => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { client: base, requests } = fixtureClient([]);
    const client: CodexAppServerClient = {
      request: base.request,
      notifications: async function* () {
        await finished;
        yield {
          method: "turn/completed",
          params: {
            threadId: "thread:one",
            turnId: "turn:one",
            turn: { id: "turn:one", status: "completed" },
          },
        };
      },
    };
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner));
    const issuer = externalId<PrincipalId>("aifsd.application");
    const admission = await admitAgentActiveInput({
      request: {
        messageId: "message:steer-one",
        correlationId: externalId<CorrelationId>("correlation:steer-one"),
        submittedAt: NOW,
        content: "Check the failing test first.",
      },
      authority: {
        kind: "agent-active-input-authority",
        authorityId: "authority:steer-one",
        issuer,
        scope: { operation: "run.input.submit", conversationId: CONVERSATION_ID, runId: RUN_ID },
        revision: 1,
        issuedAt: "2026-08-27T09:00:00.000Z",
        expiresAt: "2026-08-27T11:00:00.000Z",
      },
      conversationId: CONVERSATION_ID,
      runId: RUN_ID,
      clock: { now: () => NOW },
      verifier: { verify: () => ({ status: "verified", issuer, revision: 1 }) },
    });
    if (admission.status !== "admitted") throw new Error("fixture admission failed");

    expect((await run.submitInput(admission.input)).status).toBe("accepted");
    const duplicate = await run.submitInput(admission.input);
    expect(duplicate).toEqual(
      expect.objectContaining({ status: "rejected", reasonCode: "duplicate-input" }),
    );
    expect(requests.map(({ method }) => method)).toEqual([
      "thread/start",
      "turn/start",
      "turn/steer",
    ]);
    expect(requests.some(({ method }) => method === "turn/interrupt")).toBe(false);
    expect(requests[2]?.params.input).toEqual([
      { type: "text", text: "Check the failing test first.", text_elements: [] },
    ]);
    finish();
    await run.result();
  });

  test("ignores deltas and recipient observations from other turns", async () => {
    const { client } = fixtureClient([
      {
        method: "item/agentMessage/delta",
        params: {
          threadId: "thread:one",
          turnId: "turn:other",
          itemId: "item:other",
          delta: "contaminated",
        },
      },
      {
        method: "item/completed",
        params: {
          threadId: "thread:one",
          turnId: "turn:other",
          completedAtMs: 1,
          item: { type: "userMessage", id: "item:other", clientId: "message:other", content: [] },
        },
      },
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread:one", turnId: "turn:one", itemId: "item:one", delta: "safe" },
      },
      {
        method: "turn/completed",
        params: {
          threadId: "thread:one",
          turnId: "turn:one",
          turn: { id: "turn:one", status: "completed" },
        },
      },
    ]);
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner));

    expect(await run.result()).toEqual(
      expect.objectContaining({ output: { kind: "text", text: "safe" } }),
    );
    expect(
      await run.activeInputEvidence({
        messageId: "message:other",
        correlationId: externalId<CorrelationId>("correlation:other"),
      }),
    ).toEqual(expect.objectContaining({ status: "unavailable" }));
  });

  test.each([
    ["disconnect", []],
    ["malformed notification", [{ method: "turn/completed", params: null }]],
  ] as const)(
    "emits an agent.run.failed terminal event after %s",
    async (_label, notifications) => {
      const { client } = fixtureClient(notifications);
      const runner = runnerWith(client);
      const run = await runner.start(await preparedRequest(runner));

      expect((await run.result()).status).toBe("failed");
      const events = [];
      for await (const event of run.events()) events.push(event);
      expect(events.map(({ kind }) => kind)).toEqual(["agent.run.started", "agent.run.failed"]);
      expect(events.at(-1)?.facts).toEqual(expect.objectContaining({ status: "failed" }));
    },
  );

  test("fails closed when the injected output redaction boundary rejects native text", async () => {
    const { client } = fixtureClient([
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread:one", turnId: "turn:one", itemId: "item:one", delta: "raw" },
      },
      {
        method: "turn/completed",
        params: {
          threadId: "thread:one",
          turnId: "turn:one",
          turn: { id: "turn:one", status: "completed" },
        },
      },
    ]);
    const runner = createCodexAppServerRunner({
      client,
      identity: { runId: () => RUN_ID, eventId: () => EVENT_ID, now: () => NOW },
      output: { projectAgentText: () => undefined },
    });
    const run = await runner.start(await preparedRequest(runner));

    expect(await run.result()).toEqual(
      expect.objectContaining({
        status: "failed",
        reasonCode: "app-server-output-redaction-rejected",
      }),
    );
  });
});
