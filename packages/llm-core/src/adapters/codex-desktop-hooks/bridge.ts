import { isExternalId, type JsonValue } from "#contracts";
import {
  isAdmittedAgentActiveInput,
  registerAgentActiveInputAcknowledgement,
  type AdmittedAgentActiveInput,
} from "../../features/agent/public";
import type {
  CodexDesktopHookBridge,
  CodexDesktopHookIdentity,
  CodexDesktopHookInbox,
  CodexDesktopHookInboxEnvelope,
  CodexDesktopHookInvocationProjection,
  CodexDesktopHookOutput,
  CodexDesktopHookProjectedInput,
  CodexDesktopHookRefusedInput,
  CodexDesktopHookTarget,
  CodexDesktopPreparedHookResult,
} from "./protocol";

const contentText = (content: JsonValue): string =>
  typeof content === "string" ? content : JSON.stringify(content);

const contextFor = (entries: readonly CodexDesktopHookInboxEnvelope[]): string =>
  entries.map(({ content }) => contentText(content)).join("\n\n");

const projected = (
  entries: readonly CodexDesktopHookInboxEnvelope[],
  projection: CodexDesktopHookProjectedInput["projection"],
): readonly CodexDesktopHookProjectedInput[] =>
  Object.freeze(
    entries.map(({ messageId, correlationId }) =>
      Object.freeze({ messageId, correlationId, projection }),
    ),
  );

const refused = (
  entries: readonly CodexDesktopHookInboxEnvelope[],
): readonly CodexDesktopHookRefusedInput[] =>
  Object.freeze(
    entries.map(({ messageId, correlationId }) =>
      Object.freeze({ messageId, correlationId, reason: "recursive-stop" as const }),
    ),
  );

const outputFor = (
  invocation: CodexDesktopHookInvocationProjection,
  text: string,
): CodexDesktopHookOutput =>
  invocation.boundary === "Stop"
    ? Object.freeze({ decision: "block" as const, reason: text })
    : Object.freeze({
        hookSpecificOutput: Object.freeze({
          hookEventName: invocation.boundary,
          additionalContext: text,
        }),
      });

const preparedResult = (
  invocation: CodexDesktopHookInvocationProjection,
  input: {
    readonly claimId: string;
    readonly inbox: CodexDesktopHookInbox;
    readonly output?: CodexDesktopHookOutput;
    readonly projectedInputs?: readonly CodexDesktopHookProjectedInput[];
    readonly refusedInputs?: readonly CodexDesktopHookRefusedInput[];
  },
): CodexDesktopPreparedHookResult => {
  const { claimId, inbox, ...values } = input;
  let state: "open" | "finalising" | "finalised" = "open";
  const finalise = async (operation: "commit" | "release"): Promise<void> => {
    if (state !== "open") throw new TypeError("Codex hook inbox claim is already finalising.");
    state = "finalising";
    try {
      if (operation === "release") {
        await inbox.release(claimId);
      } else {
        const outcome = values.projectedInputs?.length
          ? "projected"
          : values.refusedInputs?.length
            ? "refused"
            : "empty";
        await inbox.commit(claimId, outcome);
      }
      state = "finalised";
    } catch (error) {
      state = "open";
      throw error;
    }
  };
  return Object.freeze({
    boundary: invocation.boundary,
    ...(values.output ? { output: values.output } : {}),
    projectedInputs: values.projectedInputs ?? Object.freeze([]),
    refusedInputs: values.refusedInputs ?? Object.freeze([]),
    commit: () => finalise("commit"),
    release: () => finalise("release"),
  });
};

const assertExternalIdentity = (value: string): void => {
  if (!isExternalId(value)) throw new TypeError("Codex hook target requires external identity.");
};

const matchesTarget = (
  entry: CodexDesktopHookInboxEnvelope,
  target: CodexDesktopHookTarget,
): boolean =>
  entry.sessionId === target.sessionId &&
  entry.turnId === target.turnId &&
  entry.runId === target.runId;

export const createCodexDesktopHookBridge = (
  target: CodexDesktopHookTarget,
  inbox: CodexDesktopHookInbox,
  identity: CodexDesktopHookIdentity,
): CodexDesktopHookBridge => {
  assertExternalIdentity(target.sessionId);
  assertExternalIdentity(target.turnId);

  return Object.freeze({
    async submitInput(input: AdmittedAgentActiveInput) {
      if (!isAdmittedAgentActiveInput(input)) {
        throw new TypeError("Codex hook input requires admitted active input.");
      }
      if (input.authorityReceipt.scope.runId !== target.runId) {
        throw new TypeError("Codex hook input authority does not match the bound run.");
      }
      const status = await inbox.submitAndAwaitProjection({
        ...target,
        messageId: input.messageId,
        correlationId: input.correlationId,
        content: input.content,
        submittedAt: input.submittedAt,
      });
      return registerAgentActiveInputAcknowledgement(
        status === "projected"
          ? {
              status: "accepted",
              messageId: input.messageId,
              correlationId: input.correlationId,
              acknowledgedAt: identity.now(),
            }
          : {
              status: "rejected",
              messageId: input.messageId,
              correlationId: input.correlationId,
              acknowledgedAt: identity.now(),
              reasonCode: status === "duplicate" ? "duplicate-input" : "provider-rejected",
            },
        input,
      );
    },

    async handle(invocation: CodexDesktopHookInvocationProjection) {
      if (
        invocation.input.sessionId !== target.sessionId ||
        invocation.input.turnId !== target.turnId
      ) {
        throw new TypeError("Codex hook invocation does not match the bound session and turn.");
      }
      const claim = await inbox.claim(target);
      if (claim.entries.some((entry) => !matchesTarget(entry, target))) {
        await inbox.release(claim.claimId);
        throw new TypeError("Codex hook inbox returned input outside the bound target.");
      }
      if (claim.entries.length === 0) {
        return preparedResult(invocation, { claimId: claim.claimId, inbox });
      }
      if (invocation.boundary === "Stop" && invocation.input.stopHookActive) {
        return preparedResult(invocation, {
          claimId: claim.claimId,
          inbox,
          refusedInputs: refused(claim.entries),
        });
      }
      const projection =
        invocation.boundary === "Stop" ? "continuation-request" : "additional-context";
      return preparedResult(invocation, {
        claimId: claim.claimId,
        inbox,
        output: outputFor(invocation, contextFor(claim.entries)),
        projectedInputs: projected(claim.entries, projection),
      });
    },
  });
};
