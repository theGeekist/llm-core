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
  ANTIGRAVITY_CLI_VERSION,
  AntigravityConcurrentRunError,
  antigravityCliHooksConversationProfile,
  createAntigravityCliHooksRunner,
  createAntigravityHookInbox,
  type AntigravityCliClient,
  type AntigravityCliCommand,
  type AntigravityProcessHandle,
  type AntigravityStreamEvent,
} from "../../../src/adapters/antigravity-cli-hooks/public";

const NOW = "2026-09-05T10:00:00.000Z";
const RUN_ID = newCoreId<RunId>("0198f0f4-8c5b-7a91-8c3b-123456789d01");
const EVENT_ID = newCoreId<EventId>("0198f0f4-8c5b-7a91-8c3b-123456789d02");
const CONVERSATION_ID = newCoreId<ConversationId>("0198f0f4-8c5b-7a91-8c3b-123456789d04");
const QUALIFIED_SOURCE = { executable: "agy" as const, version: ANTIGRAVITY_CLI_VERSION };

const initEvent = (conversationId: string): AntigravityStreamEvent => ({
  event: "init",
  conversation_id: conversationId,
  init: { cwd: "/redacted", tools: [], permission_mode: "request-review" },
});

const stepEvent = (conversationId: string, textDelta: string): AntigravityStreamEvent => ({
  event: "step_update",
  step_update: {
    conversation_id: conversationId,
    step_index: 3,
    state: "ACTIVE",
    step_type: "agent_response",
    text_delta: textDelta,
  },
});

const resultEvent = (
  conversationId: string,
  status: "SUCCESS" | "ERROR" | "CANCELED" | "INTERRUPTED" = "SUCCESS",
  response = "fixture output",
): AntigravityStreamEvent => ({
  event: "result",
  result: {
    conversation_id: conversationId,
    status,
    response,
    ...(status === "ERROR" ? { error: "redacted native failure" } : {}),
  },
});

interface MockClientState {
  readonly client: AntigravityCliClient;
  readonly spawnedCommands: AntigravityCliCommand[];
}

const fixtureClient = (
  eventsToEmit: readonly AntigravityStreamEvent[],
  handleConversationId?: string,
): MockClientState => {
  const spawnedCommands: AntigravityCliCommand[] = [];
  const client: AntigravityCliClient = {
    sourceContract: QUALIFIED_SOURCE,
    spawn: (command: AntigravityCliCommand): AntigravityProcessHandle => {
      spawnedCommands.push(command);
      return {
        ...(handleConversationId ? { conversationId: handleConversationId } : {}),
        events: (async function* () {
          for (const event of eventsToEmit) yield event;
        })(),
        cancel: () => {},
      };
    },
  };
  return { client, spawnedCommands };
};

const runnerWith = (client: AntigravityCliClient) =>
  createAntigravityCliHooksRunner({
    client,
    identity: { runId: () => RUN_ID, eventId: () => EVENT_ID, now: () => NOW },
    output: { projectAgentText: ({ text }) => text.replaceAll("secret", "[redacted]") },
  });

const preparedRequest = async (
  runner: ReturnType<typeof runnerWith>,
  providerSessionId?: string,
) => ({
  agent: await runner.prepare({
    agentId: "agent.antigravity-test",
    version: contractVersion("1.0.0"),
    instructions: "Exercise the Antigravity CLI adapter.",
    effectRequirement: "read-only" as const,
  }),
  invocationContext: { invocationId: "0198f0f4-8c5b-7a91-8c3b-123456789d03" as never },
  input: { kind: "text", text: "Return fixture output." },
  ...(providerSessionId
    ? {
        providerSession: {
          kind: "provider-session-ref" as const,
          providerId: "provider.antigravity",
          sessionId: providerSessionId,
        } as never,
      }
    : {}),
});

const admittedInputFixture = async () => {
  const issuer = externalId<PrincipalId>("aifsd.application");
  const admission = await admitAgentActiveInput({
    request: {
      messageId: "msg:unsupported",
      correlationId: externalId<CorrelationId>("corr:unsupported"),
      submittedAt: NOW,
      content: "must remain local",
    },
    authority: {
      kind: "agent-active-input-authority",
      authorityId: "authority:unsupported",
      issuer,
      scope: {
        operation: "run.input.submit",
        conversationId: CONVERSATION_ID,
        runId: RUN_ID,
      },
      revision: 1,
      issuedAt: "2026-09-05T09:00:00.000Z",
      expiresAt: "2026-09-05T11:00:00.000Z",
    },
    conversationId: CONVERSATION_ID,
    runId: RUN_ID,
    clock: { now: () => NOW },
    verifier: { verify: () => ({ status: "verified", issuer, revision: 1 }) },
  });
  if (admission.status !== "admitted") throw new Error("Fixture admission failed");
  return admission.input;
};

describe("Antigravity CLI hooks native conversation adapter", () => {
  test("pins the qualified 1.1.27 operation matrix", async () => {
    const capabilities = await runnerWith(fixtureClient([]).client).capabilities();
    expect(ANTIGRAVITY_CLI_VERSION).toBe("1.1.27");
    expect(capabilities.nativeConversation).toBe(antigravityCliHooksConversationProfile);
    expect(capabilities.nativeConversation.operations).toEqual([
      expect.objectContaining({ operation: "conversation.start", disposition: "supported" }),
      expect.objectContaining({ operation: "conversation.continue", disposition: "supported" }),
      expect.objectContaining({ operation: "run.observe", disposition: "supported" }),
      {
        operation: "run.input.submit",
        disposition: "unsupported",
        reasonCode: "qualification-failed",
      },
      {
        operation: "run.cancel",
        disposition: "unsupported",
        reasonCode: "qualification-failed",
      },
    ]);
    expect(capabilities.cancellation).toBe("none");
  });

  test("rejects a client outside the qualified CLI source contract", () => {
    const { client } = fixtureClient([]);
    expect(() =>
      runnerWith({
        ...client,
        sourceContract: { executable: "agy", version: "1.1.26" },
      }),
    ).toThrow("does not match the qualified source contract");
  });

  test("parses captured 1.1.27 wire and projects the terminal response", async () => {
    const id = "conv:wire-one";
    const { client, spawnedCommands } = fixtureClient([
      initEvent(id),
      stepEvent(id, "secret partial"),
      resultEvent(id, "SUCCESS", "secret final"),
    ]);
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner));

    expect(await run.providerSession()).toEqual({
      kind: "provider-session-ref",
      providerId: "provider.antigravity",
      sessionId: id,
    } as never);
    expect(await run.result()).toEqual(
      expect.objectContaining({
        status: "completed",
        output: { kind: "text", text: "[redacted] final" },
      }),
    );
    expect(spawnedCommands).toEqual([
      { prompt: "Return fixture output.", outputFormat: "stream-json" },
    ]);
  });

  test("resolves a continuation provider session before native stream output", async () => {
    const id = "conv:continued";
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client: AntigravityCliClient = {
      sourceContract: QUALIFIED_SOURCE,
      spawn: () => ({
        events: (async function* () {
          await blocked;
          yield initEvent(id);
          yield resultEvent(id);
        })(),
        cancel: () => {},
      }),
    };
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner, id));
    expect(await run.providerSession()).toEqual(
      expect.objectContaining({ providerId: "provider.antigravity", sessionId: id }),
    );
    release();
    expect((await run.result()).status).toBe("completed");
  });

  test("retains the continuation session while failing later stream identity drift", async () => {
    const runner = runnerWith(
      fixtureClient([initEvent("conv:drift"), resultEvent("conv:drift")]).client,
    );
    const run = await runner.start(await preparedRequest(runner, "conv:expected"));
    expect(await run.providerSession()).toEqual(
      expect.objectContaining({ sessionId: "conv:expected" }),
    );
    expect((await run.result()).reasonCode).toBe("cli-malformed-notification");
  });

  test("returns unsupported input and cancellation without native side effects", async () => {
    const id = "conv:unsupported";
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let nativeCancellations = 0;
    const client: AntigravityCliClient = {
      sourceContract: QUALIFIED_SOURCE,
      spawn: () => ({
        conversationId: id,
        events: (async function* () {
          await blocked;
          yield initEvent(id);
          yield resultEvent(id);
        })(),
        cancel: () => {
          nativeCancellations += 1;
        },
      }),
    };
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner));
    const input = await admittedInputFixture();

    expect(await run.submitInput(input)).toEqual({
      status: "unsupported",
      messageId: input.messageId,
      correlationId: input.correlationId,
      acknowledgedAt: NOW,
    });
    expect(await run.cancel({ requestedAt: NOW, reason: "user-requested" })).toEqual({
      status: "unsupported",
      acknowledgedAt: NOW,
    });
    expect(nativeCancellations).toBe(0);
    release();
    await run.result();
  });

  test("prepares exact hook outputs and commits only after native delivery", async () => {
    const id = "conv:hooks";
    const inbox = createAntigravityHookInbox();
    inbox.write({
      conversationId: id,
      messageId: "msg:pre",
      correlationId: "corr:pre",
      content: "next user step",
      submittedAt: NOW,
    });
    const first = await inbox.prepare({
      boundary: "PostInvocation",
      input: { conversationId: id, invocationNum: 1, initialNumSteps: 3 },
    });
    expect(first).toMatchObject({
      boundary: "PostInvocation",
      output: {
        injectSteps: [{ userMessage: "next user step" }],
        terminationBehavior: "force_continue",
      },
      projectedInputs: [{ messageId: "msg:pre", correlationId: "corr:pre" }],
      refusedInputs: [],
    });
    first.release();
    expect(() => first.commit()).toThrow("already finalised");

    const redelivered = await inbox.prepare({
      boundary: "PreInvocation",
      input: { conversationId: id, invocationNum: 2, initialNumSteps: 4 },
    });
    expect(redelivered).toMatchObject({
      boundary: "PreInvocation",
      output: { injectSteps: [{ userMessage: "next user step" }] },
      projectedInputs: [{ messageId: "msg:pre", correlationId: "corr:pre" }],
    });
    redelivered.commit();

    inbox.write({
      conversationId: id,
      messageId: "msg:discard",
      correlationId: "corr:discard",
      content: "must not leak",
      submittedAt: NOW,
    });
    const stopped = await inbox.prepare({
      boundary: "Stop",
      input: {
        conversationId: id,
        executionNum: 2,
        terminationReason: "model_stop",
        fullyIdle: true,
      },
    });
    expect(stopped).toMatchObject({
      boundary: "Stop",
      output: { decision: "stop" },
      projectedInputs: [],
      refusedInputs: [
        {
          messageId: "msg:discard",
          correlationId: "corr:discard",
          reasonCode: "stop-boundary-refused",
        },
      ],
    });
    expect(() =>
      inbox.write({
        conversationId: id,
        messageId: "msg:late",
        correlationId: "corr:late",
        content: "must not cross Stop",
        submittedAt: NOW,
      }),
    ).toThrow("Stop claim is open");
    expect(() => inbox.remove(id, "msg:discard", "corr:discard")).toThrow(
      "cannot remove input while a claim is open",
    );
    expect(() =>
      inbox.prepare({
        boundary: "PreInvocation",
        input: { conversationId: id, invocationNum: 3, initialNumSteps: 4 },
      }),
    ).toThrow("already has a prepared claim");
    stopped.commit();
    const empty = await inbox.prepare({
      boundary: "PreInvocation",
      input: { conversationId: id, invocationNum: 3, initialNumSteps: 4 },
    });
    expect(empty.output).toBeUndefined();
    expect(empty.projectedInputs).toEqual([]);
    empty.commit();
  });

  test("rejects non-portable hook inbox content at runtime", () => {
    const inbox = createAntigravityHookInbox();
    expect(() =>
      inbox.write({
        conversationId: "conv:hooks",
        messageId: "msg:hostile",
        correlationId: "corr:hostile",
        content: Symbol("hostile") as never,
        submittedAt: NOW,
      }),
    ).toThrow("portable identity, content, and submission time");
  });

  test("rejects concurrent idle continuation before a second process spawns", async () => {
    const id = "conv:busy";
    let releaseSpawn!: () => void;
    const spawnBlocked = new Promise<void>((resolve) => {
      releaseSpawn = resolve;
    });
    let releaseRun!: () => void;
    const runBlocked = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    let spawnCount = 0;
    const client: AntigravityCliClient = {
      sourceContract: QUALIFIED_SOURCE,
      spawn: async () => {
        spawnCount += 1;
        if (spawnCount === 1) await spawnBlocked;
        return {
          conversationId: id,
          events: (async function* () {
            yield initEvent(id);
            await runBlocked;
            yield resultEvent(id);
          })(),
          cancel: () => {},
        };
      },
    };
    const runner = runnerWith(client);
    const firstRequest = await preparedRequest(runner, id);
    const secondRequest = await preparedRequest(runner, id);
    const firstRunPromise = runner.start(firstRequest);
    await expect(runner.start(secondRequest)).rejects.toThrow(AntigravityConcurrentRunError);
    expect(spawnCount).toBe(1);
    releaseSpawn();
    const firstRun = await firstRunPromise;
    releaseRun();
    await firstRun.result();
  });

  test.each([
    ["process loss", []],
    ["malformed event", [{ event: "unknown" } as never]],
  ] as const)("emits one failed terminal event after %s", async (_label, events) => {
    const runner = runnerWith(fixtureClient(events).client);
    const run = await runner.start(await preparedRequest(runner));
    expect((await run.result()).status).toBe("failed");
    const kinds = [];
    for await (const event of run.events()) kinds.push(event.kind);
    expect(kinds).toEqual(["agent.run.started", "agent.run.failed"]);
  });
});
