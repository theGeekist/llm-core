import { describe, expect, test } from "bun:test";
import {
  externalId,
  newCoreId,
  type ConversationId,
  type CorrelationId,
  type PrincipalId,
  type RunId,
} from "#contracts";
import { admitAgentActiveInput } from "../../../src/agent/runtime";
import {
  CODEX_DESKTOP_BUNDLED_CLI_VERSION,
  CODEX_DESKTOP_HOST_VERSION,
  codexDesktopHooksConversationProfile,
  createCodexDesktopHookBridge,
  type CodexDesktopHookInbox,
  type CodexDesktopHookInboxEnvelope,
  type CodexDesktopHookTarget,
} from "../../../src/adapters/codex-desktop-hooks/public";

const NOW = "2026-09-05T12:00:00.000Z";
const RUN_ID = newCoreId<RunId>("0198f0f4-8c5b-7a91-8c3b-123456789d01");
const OTHER_RUN_ID = newCoreId<RunId>("0198f0f4-8c5b-7a91-8c3b-123456789d02");
const CONVERSATION_ID = newCoreId<ConversationId>("0198f0f4-8c5b-7a91-8c3b-123456789d04");
const TARGET: CodexDesktopHookTarget = {
  sessionId: "session:one",
  turnId: "turn:one",
  runId: RUN_ID,
};

const admittedInput = async (messageId = "message:one", runId = RUN_ID) => {
  const issuer = externalId<PrincipalId>("aifsd.application");
  const admission = await admitAgentActiveInput({
    request: {
      messageId,
      correlationId: externalId<CorrelationId>(`correlation:${messageId}`),
      submittedAt: NOW,
      content: "Check the new failure before stopping.",
    },
    authority: {
      kind: "agent-active-input-authority",
      authorityId: `authority:${messageId}`,
      issuer,
      scope: { operation: "run.input.submit", conversationId: CONVERSATION_ID, runId },
      revision: 1,
      issuedAt: "2026-09-05T11:00:00.000Z",
      expiresAt: "2026-09-05T13:00:00.000Z",
    },
    conversationId: CONVERSATION_ID,
    runId,
    clock: { now: () => NOW },
    verifier: { verify: () => ({ status: "verified", issuer, revision: 1 }) },
  });
  if (admission.status !== "admitted") throw new Error("Fixture admission failed");
  return admission.input;
};

const inboxFixture = () => {
  const pending: CodexDesktopHookInboxEnvelope[] = [];
  const submitted = new Set<string>();
  const claims = new Map<string, CodexDesktopHookInboxEnvelope[]>();
  const receipts = new Map<string, (status: "projected" | "refused" | "rejected") => void>();
  let claimSequence = 0;
  let commits = 0;
  const inbox: CodexDesktopHookInbox = {
    submitAndAwaitProjection: (entry) => {
      if (submitted.has(entry.messageId)) return "duplicate";
      submitted.add(entry.messageId);
      pending.push(entry);
      return new Promise((resolve) => receipts.set(entry.messageId, resolve));
    },
    claim: (target) => {
      const claimId = `claim:${claimSequence++}`;
      const busy = [...claims.values()].some((entries) => entries.length > 0);
      const entries = busy
        ? []
        : pending.filter(
            (entry) =>
              entry.sessionId === target.sessionId &&
              entry.turnId === target.turnId &&
              entry.runId === target.runId,
          );
      for (const entry of entries) pending.splice(pending.indexOf(entry), 1);
      claims.set(claimId, entries);
      return { claimId, entries };
    },
    commit: (claimId, outcome) => {
      for (const entry of claims.get(claimId) ?? []) {
        receipts.get(entry.messageId)?.(outcome === "projected" ? "projected" : "refused");
        receipts.delete(entry.messageId);
      }
      claims.delete(claimId);
      commits += 1;
    },
    release: (claimId) => {
      pending.unshift(...(claims.get(claimId) ?? []));
      claims.delete(claimId);
    },
  };
  return { inbox, pending, commits: () => commits };
};

const bridgeWith = (inbox: CodexDesktopHookInbox) =>
  createCodexDesktopHookBridge(TARGET, inbox, { now: () => NOW });

const queueInput = async (
  bridge: ReturnType<typeof bridgeWith>,
  input: Awaited<ReturnType<typeof admittedInput>>,
) => {
  let settled = false;
  const receipt = Promise.resolve(bridge.submitInput(input)).then((value) => {
    settled = true;
    return value;
  });
  await Promise.resolve();
  return { receipt, settled: () => settled };
};

const toolInvocation = (boundary: "PreToolUse" | "PostToolUse") => ({
  boundary,
  input: { sessionId: TARGET.sessionId, turnId: TARGET.turnId, toolName: "Bash" },
});

describe("Codex Desktop hook bridge", () => {
  test("pins the installed Desktop hook profile and honest operation matrix", () => {
    expect(CODEX_DESKTOP_HOST_VERSION).toBe("26.901.31953");
    expect(CODEX_DESKTOP_BUNDLED_CLI_VERSION).toBe("0.153.1");
    expect(codexDesktopHooksConversationProfile.operations).toEqual([
      expect.objectContaining({ operation: "conversation.start", disposition: "unsupported" }),
      expect.objectContaining({ operation: "conversation.continue", disposition: "unsupported" }),
      expect.objectContaining({ operation: "run.observe", disposition: "unsupported" }),
      expect.objectContaining({
        operation: "run.input.submit",
        disposition: "supported",
        deliveryMode: "execution-boundary",
      }),
      expect.objectContaining({ operation: "run.cancel", disposition: "unsupported" }),
    ]);
  });

  test("binds admitted input to the configured session, turn, and portable run", async () => {
    const state = inboxFixture();
    const bridge = bridgeWith(state.inbox);
    const input = await admittedInput();
    const queued = await queueInput(bridge, input);

    expect(queued.settled()).toBe(false);
    expect(state.pending).toEqual([expect.objectContaining(TARGET)]);
    expect(await bridge.submitInput(input)).toEqual(
      expect.objectContaining({ status: "rejected", reasonCode: "duplicate-input" }),
    );
    const prepared = await bridge.handle(toolInvocation("PostToolUse"));
    expect(queued.settled()).toBe(false);
    await prepared.commit();
    expect(await queued.receipt).toEqual({
      status: "accepted",
      messageId: input.messageId,
      correlationId: input.correlationId,
      acknowledgedAt: NOW,
    });
    await expect(
      bridge.submitInput(await admittedInput("message:wrong", OTHER_RUN_ID)),
    ).rejects.toThrow("bound run");
  });

  test.each(["PreToolUse", "PostToolUse"] as const)(
    "prepares exact additional-context output at %s",
    async (boundary) => {
      const state = inboxFixture();
      const bridge = bridgeWith(state.inbox);
      const queued = await queueInput(bridge, await admittedInput());
      const result = await bridge.handle(toolInvocation(boundary));

      expect(result.output).toEqual({
        hookSpecificOutput: {
          hookEventName: boundary,
          additionalContext: "Check the new failure before stopping.",
        },
      });
      expect(result.projectedInputs).toEqual([
        {
          messageId: "message:one",
          correlationId: "correlation:message:one",
          projection: "additional-context",
        },
      ]);
      expect(state.commits()).toBe(0);
      expect(queued.settled()).toBe(false);
      await result.commit();
      expect((await queued.receipt).status).toBe("accepted");
      expect(state.commits()).toBe(1);
    },
  );

  test("prepares UserPromptSubmit context without replacing the prompt", async () => {
    const state = inboxFixture();
    const bridge = bridgeWith(state.inbox);
    const queued = await queueInput(bridge, await admittedInput());
    const result = await bridge.handle({
      boundary: "UserPromptSubmit",
      input: { sessionId: TARGET.sessionId, turnId: TARGET.turnId },
    });

    expect(result.output).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "Check the new failure before stopping.",
      },
    });
    await result.commit();
    expect((await queued.receipt).status).toBe("accepted");
  });

  test("prepares one Stop continuation and refuses recursive projection", async () => {
    const state = inboxFixture();
    const bridge = bridgeWith(state.inbox);
    const queued = await queueInput(bridge, await admittedInput());
    const first = await bridge.handle({
      boundary: "Stop",
      input: { sessionId: TARGET.sessionId, turnId: TARGET.turnId, stopHookActive: false },
    });
    expect(first.output).toEqual({
      decision: "block",
      reason: "Check the new failure before stopping.",
    });
    expect(first.projectedInputs[0]).toEqual(
      expect.objectContaining({ projection: "continuation-request" }),
    );
    await first.commit();
    expect((await queued.receipt).status).toBe("accepted");

    const recursiveReceipt = await queueInput(bridge, await admittedInput("message:recursive"));
    const recursive = await bridge.handle({
      boundary: "Stop",
      input: { sessionId: TARGET.sessionId, turnId: TARGET.turnId, stopHookActive: true },
    });
    expect(recursive.output).toBeUndefined();
    expect(recursive.projectedInputs).toEqual([]);
    expect(recursive.refusedInputs).toEqual([
      expect.objectContaining({
        messageId: "message:recursive",
        reason: "recursive-stop",
      }),
    ]);
    await recursive.commit();
    expect(await recursiveReceipt.receipt).toEqual(
      expect.objectContaining({ status: "rejected", reasonCode: "provider-rejected" }),
    );
  });

  test("releases failed output for redelivery and fences simultaneous claims", async () => {
    const state = inboxFixture();
    const bridge = bridgeWith(state.inbox);
    const queued = await queueInput(bridge, await admittedInput());
    const first = await bridge.handle(toolInvocation("PostToolUse"));
    const concurrent = await bridge.handle(toolInvocation("PostToolUse"));
    expect(concurrent.output).toBeUndefined();
    expect(concurrent.projectedInputs).toEqual([]);
    await concurrent.commit();
    expect(queued.settled()).toBe(false);

    await first.release();
    expect(queued.settled()).toBe(false);
    const retried = await bridge.handle(toolInvocation("PostToolUse"));
    expect(retried.projectedInputs).toHaveLength(1);
    await retried.commit();
    expect((await queued.receipt).status).toBe("accepted");
    await expect(retried.release()).rejects.toThrow("already finalising");
  });

  test("fences commit and release while finalisation is in flight", async () => {
    const state = inboxFixture();
    let finishCommit!: () => void;
    const commitGate = new Promise<void>((resolve) => {
      finishCommit = resolve;
    });
    const inbox: CodexDesktopHookInbox = {
      ...state.inbox,
      commit: async (claimId, outcome) => {
        await commitGate;
        await state.inbox.commit(claimId, outcome);
      },
    };
    const bridge = bridgeWith(inbox);
    const queued = await queueInput(bridge, await admittedInput());
    const prepared = await bridge.handle(toolInvocation("PostToolUse"));
    const committing = prepared.commit();

    await expect(prepared.release()).rejects.toThrow("already finalising");
    expect(queued.settled()).toBe(false);
    finishCommit();
    await committing;
    expect((await queued.receipt).status).toBe("accepted");
  });

  test("rejects hook identity drift and releases mismatched inbox entries", async () => {
    const state = inboxFixture();
    const bridge = bridgeWith(state.inbox);
    await expect(
      bridge.handle({
        boundary: "PostToolUse",
        input: { sessionId: TARGET.sessionId, turnId: "turn:other", toolName: "Bash" },
      }),
    ).rejects.toThrow("bound session and turn");

    const input = await admittedInput();
    const badInbox: CodexDesktopHookInbox = {
      submitAndAwaitProjection: () => "projected",
      claim: () => ({
        claimId: "claim:bad",
        entries: [
          {
            ...TARGET,
            turnId: "turn:other",
            messageId: input.messageId,
            correlationId: input.correlationId,
            submittedAt: input.submittedAt,
            content: input.content,
          },
        ],
      }),
      commit: () => {},
      release: () => {},
    };
    await expect(bridgeWith(badInbox).handle(toolInvocation("PostToolUse"))).rejects.toThrow(
      "outside the bound target",
    );
  });

  test("does not expose private Desktop transport or app-server operations", () => {
    const publicKeys = Object.keys(bridgeWith(inboxFixture().inbox));
    expect(publicKeys).toEqual(["submitInput", "handle"]);
    expect(publicKeys).not.toContain("attach");
    expect(publicKeys).not.toContain("turnSteer");
    expect(publicKeys).not.toContain("cancel");
  });
});
