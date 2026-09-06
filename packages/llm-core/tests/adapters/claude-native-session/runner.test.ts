import { describe, expect, test } from "bun:test";
import { externalId, type CorrelationId } from "#contracts";
import {
  type ClaudeNativeSessionClient,
  type ClaudeStreamEvent,
} from "../../../src/adapters/claude-native-session/public";
import {
  NOW,
  SESSION_ID,
  admittedInputFixture,
  fixtureClient,
  preparedRequest,
  runnerWith,
} from "./fixtures";

describe("Claude native-session conversation adapter", () => {
  test("starts a headless run, exposes early provider identity and projects terminal output", async () => {
    const { client, spawnedCommands } = fixtureClient([
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "secret result" }] },
      } as unknown as ClaudeStreamEvent,
      {
        type: "result",
        subtype: "success",
        result: "secret result",
        session_id: SESSION_ID,
        is_error: false,
        terminal_reason: "completed",
      } as unknown as ClaudeStreamEvent,
    ]);
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner));

    expect(await run.providerSession()).toEqual({
      kind: "provider-session-ref",
      providerId: "provider.claude",
      sessionId: SESSION_ID,
    } as never);

    expect(await run.result()).toEqual(
      expect.objectContaining({
        status: "completed",
        output: { kind: "text", text: "[redacted] result" },
      }),
    );

    const events: string[] = [];
    for await (const event of run.events()) events.push(event.kind);
    expect(events).toEqual(["agent.run.started", "agent.run.completed"]);
    expect(spawnedCommands.length).toBe(1);
    expect(spawnedCommands[0]?.sessionId).toBeUndefined();
    expect(spawnedCommands[0]?.options).toEqual({
      print: true,
      outputFormat: "stream-json",
      verbose: true,
      includeHookEvents: true,
    });
  });

  test("continues an idle session with exact provider session identity", async () => {
    const storedSessionId = "claude-session:stored456";
    const { client, spawnedCommands } = fixtureClient(
      [
        {
          type: "result",
          subtype: "success",
          result: "done",
          session_id: storedSessionId,
          is_error: false,
          terminal_reason: "completed",
        } as unknown as ClaudeStreamEvent,
      ],
      storedSessionId,
    );
    const runner = runnerWith(client);
    const run = await runner.start(
      await preparedRequest(runner, {
        kind: "provider-session-ref",
        providerId: "provider.claude",
        sessionId: storedSessionId,
      }),
    );

    expect(spawnedCommands[0]?.sessionId).toBe(storedSessionId);
    expect((await run.result()).status).toBe("completed");
    expect(await run.providerSession()).toEqual({
      kind: "provider-session-ref",
      providerId: "provider.claude",
      sessionId: storedSessionId,
    } as never);
  });

  test("rejects continuation with a non-Claude provider session reference", async () => {
    const { client } = fixtureClient([]);
    const runner = runnerWith(client);
    await expect(
      runner.start(
        await preparedRequest(runner, {
          kind: "provider-session-ref",
          providerId: "provider.codex",
          sessionId: "thread:wrong-provider",
        }),
      ),
    ).rejects.toThrow(
      "Claude native-session continuation requires a Claude provider-session reference.",
    );
  });

  test("fails closed when native init changes the caller-selected session identity", async () => {
    const client: ClaudeNativeSessionClient = {
      spawn: () => ({
        sessionId: SESSION_ID,
        events: (async function* () {
          yield {
            type: "system",
            subtype: "init",
            session_id: "claude-session:different",
          } as ClaudeStreamEvent;
        })(),
        cancel: () => undefined,
      }),
    };
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner));
    expect(await run.result()).toEqual(
      expect.objectContaining({ status: "failed", reasonCode: "session-identity-mismatch" }),
    );
  });

  test("fails closed when terminal output arrives before a matching native init", async () => {
    const client: ClaudeNativeSessionClient = {
      spawn: () => ({
        sessionId: SESSION_ID,
        events: (async function* () {
          yield {
            type: "result",
            subtype: "success",
            result: "done",
            session_id: SESSION_ID,
            is_error: false,
            terminal_reason: "completed",
          } as ClaudeStreamEvent;
        })(),
        cancel: () => undefined,
      }),
    };
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner));

    expect(await run.result()).toEqual(
      expect.objectContaining({ status: "failed", reasonCode: "session-init-missing" }),
    );
  });

  test("fails unsupported active input and cancellation explicitly", async () => {
    let cancelCalled = false;
    const { client } = fixtureClient([
      {
        type: "result",
        subtype: "success",
        result: "done",
        session_id: SESSION_ID,
        is_error: false,
        terminal_reason: "completed",
      } as unknown as ClaudeStreamEvent,
    ]);
    const guardedClient: ClaudeNativeSessionClient = {
      spawn: async (command) => {
        const handle = await client.spawn(command);
        return {
          ...handle,
          cancel: () => {
            cancelCalled = true;
          },
        };
      },
    };
    const runner = runnerWith(guardedClient);
    const run = await runner.start(await preparedRequest(runner));
    const input = await admittedInputFixture("msg:unsupported", "Do not deliver.");

    expect((await run.submitInput(input)).status).toBe("unsupported");
    expect(await run.cancel({ reason: "user-requested", requestedAt: NOW })).toEqual({
      status: "unsupported",
      acknowledgedAt: NOW,
    });
    expect(cancelCalled).toBe(false);
  });

  test.each([
    [
      "mismatched terminal identity",
      {
        type: "result",
        subtype: "success",
        result: "done",
        session_id: "claude-session:wrong",
        is_error: false,
        terminal_reason: "completed",
      },
      "session-terminal-identity-mismatch",
    ],
    [
      "missing terminal identity",
      {
        type: "result",
        subtype: "success",
        result: "done",
        session_id: null,
        is_error: false,
        terminal_reason: "completed",
      },
      "session-terminal-identity-mismatch",
    ],
    [
      "authentication failure markers",
      {
        type: "result",
        subtype: "success",
        result: "",
        session_id: SESSION_ID,
        is_error: true,
        error: "authentication_failed",
        terminal_reason: "authentication_failed",
      },
      "session-authentication-failed",
    ],
  ] as const)("fails closed for %s", async (_label, nativeResult, reasonCode) => {
    const { client } = fixtureClient([nativeResult as unknown as ClaudeStreamEvent]);
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner));
    expect(await run.result()).toEqual(expect.objectContaining({ status: "failed", reasonCode }));
  });

  test("preserves native record order and extension data through the composition observer", async () => {
    const extension = {
      type: "rate_limit_event",
      extension: { bucket: "five-hour", remaining: 42 },
    } as unknown as ClaudeStreamEvent;
    const { client } = fixtureClient([
      extension,
      {
        type: "result",
        subtype: "success",
        result: "done",
        session_id: SESSION_ID,
        is_error: false,
        terminal_reason: "completed",
      } as unknown as ClaudeStreamEvent,
    ]);
    const observedEvents: ClaudeStreamEvent[] = [];
    const runner = runnerWith(client, observedEvents);
    const run = await runner.start(await preparedRequest(runner));
    await run.result();

    expect(observedEvents.map(({ type }) => type)).toEqual([
      "system",
      "rate_limit_event",
      "result",
    ]);
    expect(observedEvents[1]).toEqual(extension);
  });

  test.each([
    ["process loss", [] as ClaudeStreamEvent[]],
    ["malformed event", [{ type: 123 }] as unknown as ClaudeStreamEvent[]],
  ])("emits agent.run.failed terminal event after %s", async (_label, events) => {
    const client: ClaudeNativeSessionClient = {
      spawn: () => ({
        sessionId: SESSION_ID,
        events: (async function* () {
          yield* events;
        })(),
        cancel: () => {},
      }),
    };
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner));

    const result = await run.result();
    expect(result.status).toBe("failed");

    const runEvents: string[] = [];
    for await (const event of run.events()) runEvents.push(event.kind);
    expect(runEvents).toContain("agent.run.failed");
  });

  test("negative fixture: unadmitted active input is rejected", async () => {
    const { client } = fixtureClient([
      {
        type: "result",
        subtype: "success",
        result: "done",
        session_id: SESSION_ID,
        is_error: false,
        terminal_reason: "completed",
      } as unknown as ClaudeStreamEvent,
    ]);
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner));

    const bogusInput = { messageId: "msg:fake", correlationId: "corr:fake", content: "Unadmitted" };
    await expect(run.submitInput(bogusInput as never)).rejects.toThrow(
      "Claude native-session active input requires admitted active input.",
    );
  });

  test("active input evidence is always unavailable with provider-unobservable", async () => {
    const { client } = fixtureClient([
      {
        type: "result",
        subtype: "success",
        result: "done",
        session_id: SESSION_ID,
        is_error: false,
        terminal_reason: "completed",
      } as unknown as ClaudeStreamEvent,
    ]);
    const runner = runnerWith(client);
    const run = await runner.start(await preparedRequest(runner));

    const evidence = await run.activeInputEvidence({
      messageId: "msg:unobserved",
      correlationId: externalId<CorrelationId>("corr:unobserved"),
    });

    expect(evidence).toEqual(
      expect.objectContaining({
        status: "unavailable",
        messageId: "msg:unobserved",
        stage: "recipient-observation",
        reasonCode: "provider-unobservable",
      }),
    );
  });
});
