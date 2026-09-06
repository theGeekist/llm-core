import { describe, expect, test } from "bun:test";
import {
  contractVersion,
  externalId,
  newCoreId,
  type ConversationId,
  type CorrelationId,
  type EventId,
  type PrincipalId,
  type ProviderSessionId,
  type RunId,
} from "#contracts";
import { admitAgentActiveInput } from "../../../src/agent/runtime";
import {
  ANTIGRAVITY_DESKTOP_HOST_VERSION,
  ANTIGRAVITY_SIDECAR_CONTRACT_VERSION,
  antigravityDesktopSidecarConversationProfile,
  createAntigravityDesktopSidecarRunner,
  runAntigravityDesktopSidecarProbe,
  AntigravitySidecarProcessError,
  type AntigravityDesktopSidecarClient,
  type AntigravitySidecarRuntimeIdentities,
} from "../../../src/adapters/antigravity-desktop-sidecar/public";
import type { AgentStartRequest, NativeAgentRunner } from "../../../src/features/agent/public";
import { createProviderSessionRef } from "../../../src/features/state/public";

const NOW = "2026-09-05T12:00:00.000Z";
const RUN_ID = newCoreId<RunId>("0198f0f4-8c5b-7a91-8c3b-123456789d01");
const EVENT_ID = newCoreId<EventId>("0198f0f4-8c5b-7a91-8c3b-123456789d02");
const CONVERSATION_ID = newCoreId<ConversationId>("0198f0f4-8c5b-7a91-8c3b-123456789d04");

const runtimeIdentities: AntigravitySidecarRuntimeIdentities = {
  desktopApp: {
    product: "Antigravity Desktop",
    version: ANTIGRAVITY_DESKTOP_HOST_VERSION,
    bundleId: "com.google.antigravity",
  },
  sidecar: { id: "simple-chat-qualification", supervised: true, restartPolicy: "never" },
  agentapi: { executable: "agentapi", providerInjected: true, path: "/usr/local/bin/agentapi" },
};

const sourceContract = {
  desktopHostVersion: ANTIGRAVITY_DESKTOP_HOST_VERSION,
  sidecarContractVersion: ANTIGRAVITY_SIDECAR_CONTRACT_VERSION,
  identities: runtimeIdentities,
};

const clientFixture = (
  overrides: Partial<AntigravityDesktopSidecarClient> = {},
): AntigravityDesktopSidecarClient => ({
  sourceContract,
  newConversation: () => ({ conversationId: "conv-native-123" }),
  sendMessage: () => ({ accepted: true }),
  inspectConversation: () => ({ state: "idle" }),
  ...overrides,
});

const identity = { runId: () => RUN_ID, eventId: () => EVENT_ID, now: () => NOW };

const preparedRequest = async (
  runner: NativeAgentRunner,
  prompt: string,
  sessionId?: string,
): Promise<AgentStartRequest> => ({
  agent: await runner.prepare({
    agentId: "test-agent",
    version: contractVersion("1.0.0"),
    instructions: "Exercise the Sidecar adapter.",
    effectRequirement: "read-only",
  }),
  invocationContext: { invocationId: "0198f0f4-8c5b-7a91-8c3b-123456789d03" as never },
  input: prompt,
  ...(sessionId
    ? {
        providerSession: createProviderSessionRef({
          kind: "provider-session-ref",
          providerId: "provider.antigravity",
          sessionId: externalId<ProviderSessionId>(sessionId),
        }),
      }
    : {}),
});

const admittedInput = async () => {
  const issuer = externalId<PrincipalId>("aifsd.application");
  const admission = await admitAgentActiveInput({
    request: {
      messageId: "message:sidecar:1",
      correlationId: externalId<CorrelationId>("correlation:sidecar:1"),
      submittedAt: NOW,
      content: "Follow up",
    },
    authority: {
      kind: "agent-active-input-authority",
      authorityId: "authority:sidecar:1",
      issuer,
      scope: { operation: "run.input.submit", conversationId: CONVERSATION_ID, runId: RUN_ID },
      revision: 1,
      issuedAt: "2026-09-05T11:00:00.000Z",
      expiresAt: "2026-09-05T13:00:00.000Z",
    },
    conversationId: CONVERSATION_ID,
    runId: RUN_ID,
    clock: { now: () => NOW },
    verifier: { verify: () => ({ status: "verified", issuer, revision: 1 }) },
  });
  if (admission.status !== "admitted") throw new Error("Fixture admission failed");
  return admission.input;
};

describe("Antigravity Desktop Sidecar profile", () => {
  test("pins the exact source contract and conservative operation matrix", () => {
    expect(antigravityDesktopSidecarConversationProfile.sourceContract.version).toBe("1.1.27");
    expect(antigravityDesktopSidecarConversationProfile.operations).toContainEqual(
      expect.objectContaining({
        operation: "run.input.submit",
        disposition: "unsupported",
        reasonCode: "qualification-failed",
      }),
    );
  });

  test("rejects a client outside the qualified version and identity tuple", () => {
    const client = clientFixture({
      sourceContract: { ...sourceContract, sidecarContractVersion: "1.1.26" },
    });
    expect(() => createAntigravityDesktopSidecarRunner({ client, identity })).toThrow(
      "does not match the qualified source contract",
    );
  });

  test("rejects hostile runtime identity values even when versions match", () => {
    const client = clientFixture({
      sourceContract: {
        ...sourceContract,
        identities: {
          ...runtimeIdentities,
          sidecar: { ...runtimeIdentities.sidecar, id: "unqualified-sidecar" },
        },
      },
    });
    expect(() => createAntigravityDesktopSidecarRunner({ client, identity })).toThrow(
      "does not match the qualified source contract",
    );
  });
});

describe("Antigravity Desktop Sidecar runner", () => {
  test("reflects a new conversation but fails closed without terminal observation", async () => {
    const runner = createAntigravityDesktopSidecarRunner({ client: clientFixture(), identity });
    const run = await runner.start(await preparedRequest(runner, "Start work"));
    expect((await run.providerSession())?.sessionId).toBe(
      externalId<ProviderSessionId>("conv-native-123"),
    );
    expect(await run.result()).toMatchObject({
      status: "failed",
      reasonCode: "provider-unobservable",
    });
    const events = [];
    for await (const event of run.events()) events.push([event.kind, event.sequence]);
    expect(events).toEqual([
      ["agent.run.started", 0],
      ["agent.run.failed", 1],
    ]);
  });

  test("continues only a verifiably idle conversation", async () => {
    let sent: unknown;
    const client = clientFixture({
      sendMessage: (request) => {
        sent = request;
        return { accepted: true };
      },
    });
    const runner = createAntigravityDesktopSidecarRunner({ client, identity });
    const run = await runner.start(await preparedRequest(runner, "Continue", "conv-idle"));
    expect(sent).toEqual({ conversationId: "conv-idle", prompt: "Continue" });
    expect(await run.result()).toMatchObject({ reasonCode: "provider-unobservable" });
  });

  test("does not send an idle continuation to a busy conversation", async () => {
    let sends = 0;
    const client = clientFixture({
      inspectConversation: () => ({ state: "busy" }),
      sendMessage: () => {
        sends += 1;
        return { accepted: true };
      },
    });
    const runner = createAntigravityDesktopSidecarRunner({ client, identity });
    const run = await runner.start(await preparedRequest(runner, "Continue", "conv-busy"));
    expect(sends).toBe(0);
    expect(await run.result()).toMatchObject({ status: "failed", reasonCode: "stale-session" });
    expect((await run.providerSession())?.sessionId).toBe(
      externalId<ProviderSessionId>("conv-busy"),
    );
  });

  test("fences simultaneous continuation while idle inspection is pending", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = clientFixture({
      inspectConversation: async () => {
        await pending;
        return { state: "idle" };
      },
    });
    const runner = createAntigravityDesktopSidecarRunner({ client, identity });
    const request = await preparedRequest(runner, "Continue", "conv-shared");
    const first = runner.start(request);
    await expect(runner.start(request)).rejects.toThrow("requires an idle conversation");
    release();
    await first;
  });

  test("returns unsupported active input without calling native ingress", async () => {
    let sends = 0;
    const client = clientFixture({
      sendMessage: () => {
        sends += 1;
        return { accepted: true };
      },
    });
    const runner = createAntigravityDesktopSidecarRunner({ client, identity });
    const run = await runner.start(await preparedRequest(runner, "Start"));
    const acknowledgement = await run.submitInput(await admittedInput());
    expect(acknowledgement.status).toBe("unsupported");
    expect(sends).toBe(0);
    expect(
      await run.activeInputEvidence({
        messageId: "message:sidecar:1",
        correlationId: externalId<CorrelationId>("correlation:sidecar:1"),
      }),
    ).toMatchObject({ status: "unavailable", reasonCode: "provider-unobservable" });
  });

  test("maps native error prose to a closed portable reason code", async () => {
    const runner = createAntigravityDesktopSidecarRunner({
      client: clientFixture({
        newConversation: () => {
          throw new AntigravitySidecarProcessError(
            "absentProcess",
            "secret path /Users/person/private/token",
          );
        },
      }),
      identity,
    });
    const run = await runner.start(await preparedRequest(runner, "Start"));
    expect(await run.result()).toMatchObject({
      status: "failed",
      reasonCode: "process-unavailable",
    });
    expect(JSON.stringify(await run.result())).not.toContain("secret path");
  });

  test("accepts only definitions prepared by the same runner", async () => {
    const first = createAntigravityDesktopSidecarRunner({ client: clientFixture(), identity });
    const second = createAntigravityDesktopSidecarRunner({ client: clientFixture(), identity });
    await expect(first.start(await preparedRequest(second, "Start"))).rejects.toThrow(
      "only definitions prepared by this runner",
    );
  });
});

describe("Antigravity Desktop Sidecar probe", () => {
  test("keeps idle command acceptance separate from recipient processing", async () => {
    const report = await runAntigravityDesktopSidecarProbe(clientFixture());
    expect(report.idleAddressability).toEqual({
      disposition: "supported",
      commandAcceptance: "observed",
      recipientObservation: "unobservable",
      semanticProcessing: "untested",
    });
    expect(report.busyTurnTiming.commandAcceptance).toBe("untested");
  });

  test("requires a native busy state before recording a busy command receipt", async () => {
    const states = ["idle", "busy"] as const;
    let inspections = 0;
    let conversations = 0;
    const report = await runAntigravityDesktopSidecarProbe(
      clientFixture({
        newConversation: () => ({ conversationId: `conv-${++conversations}` }),
        inspectConversation: () => ({ state: states[inspections++] ?? "stale" }),
      }),
      { activeTurnScenario: { initialPrompt: "Hold busy", followUpPrompt: "Nonce" } },
    );
    expect(report.busyTurnTiming).toMatchObject({
      classification: "unqualified",
      commandAcceptance: "observed",
      recipientObservation: "unobservable",
      semanticProcessing: "untested",
    });
  });

  test("does not treat a caller scenario flag as proof of busy state", async () => {
    const report = await runAntigravityDesktopSidecarProbe(clientFixture(), {
      activeTurnScenario: { initialPrompt: "Hold busy", followUpPrompt: "Nonce" },
    });
    expect(report).toMatchObject({
      outcome: "bounded-negative",
      reasonCode: "busy-state-unproven",
    });
  });
});
