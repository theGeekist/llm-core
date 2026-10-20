import { cloneFrozen } from "#shared/portable-data";
import type { ClaudeStreamEvent } from "./protocol";

/** Native stream vocabulary and selected route; provider acknowledgements remain separate from processing. */
export const claudeStreamContract = cloneFrozen({
  providerId: "provider.claude",
  routeProfileId: "claude.cross-session.inbox",
  runnerId: "claude.native-session",
  outputFormat: "stream-json",
  events: {
    initialisation: { type: "system", subtype: "init" },
    assistant: { type: "assistant", textPartType: "text" },
    terminal: { type: "result", successfulSubtype: "success", completedReason: "completed" },
  },
  portableEvents: {
    started: "agent.run.started",
    completed: "agent.run.completed",
    failed: "agent.run.failed",
    denied: "agent.run.denied",
    cancelled: "agent.run.cancelled",
  },
  failures: {
    terminalIdentityMismatch: {
      code: "session-terminal-identity-mismatch",
      meaning: "Terminal result does not belong to the selected native session.",
    },
    outputRedactionRejected: {
      code: "session-output-redaction-rejected",
      meaning: "Composition declined to project terminal output.",
    },
    initialIdentityMismatch: {
      code: "session-identity-mismatch",
      meaning: "Native init does not match the selected session.",
    },
    initialisationMissing: {
      code: "session-init-missing",
      meaning: "Observable content arrived before a matching native init.",
    },
    processLoss: {
      code: "process-loss",
      meaning: "The native stream ended without a terminal result.",
    },
    malformedOutput: {
      code: "session-malformed-output",
      meaning: "Native stream or projection processing failed.",
    },
    recipientUnobservable: {
      code: "provider-unobservable",
      meaning: "Native ingress provides no recipient processing observation.",
    },
    executionError: {
      code: "session-execution-error",
      meaning: "Native result lacks a more specific failure reason.",
    },
  },
  // Human exception text is not a machine-code vocabulary.
  messages: {
    invalidContinuationProvider:
      "Claude native-session continuation requires a Claude provider-session reference.",
    foreignPreparedDefinition:
      "Claude native-session runner accepts only definitions prepared by this runner.",
    sessionAlreadyActive: "Claude continuation cannot start while that session is active.",
    sessionIdentityMissing: "Claude process did not expose its caller-selected session identity.",
    continuationIdentityChanged: "Claude continuation changed the requested session identity.",
    malformedNativeEvent: "Malformed stream-json event emitted by Claude native session.",
    unadmittedActiveInput: "Claude native-session active input requires admitted active input.",
  },
} as const);

/** Unknown native reasons are retained and normalized, never coerced into a known success. */
export const terminalFailureReason = (event: ClaudeStreamEvent): string => {
  if (typeof event.error === "string") return `session-${event.error}`.replace(/_/g, "-");
  if (
    typeof event.terminal_reason === "string" &&
    event.terminal_reason !== claudeStreamContract.events.terminal.completedReason
  ) {
    return `session-${event.terminal_reason}`.replace(/_/g, "-");
  }
  return typeof event.subtype === "string"
    ? `session-${event.subtype}`.replace(/_/g, "-")
    : claudeStreamContract.failures.executionError.code;
};
