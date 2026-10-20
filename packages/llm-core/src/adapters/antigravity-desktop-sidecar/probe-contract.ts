import { cloneFrozen } from "#shared/portable-data";

/** Qualification is bound to one runtime tuple, not merely a product name. */
export const sidecarProbeContract = cloneFrozen({
  providerId: "provider.antigravity",
  routeProfileId: "antigravity.desktop-sidecar.agentapi",
  hostVersion: "2.11.0",
  // Historical minimum qualification; the probe still requires exact hostVersion above.
  minimumQualifiedHostVersion: "2.8.1",
  sidecarVersion: "1.1.27",
  runtime: {
    product: "Antigravity Desktop",
    bundleId: "com.google.antigravity",
    sidecarId: "simple-chat-qualification",
    restartPolicy: "never",
    executable: "agentapi",
    executablePath: "/usr/local/bin/agentapi",
  },
  prompts: {
    idleStart: "qualification:probe:idle:start",
    idleContinuation: "qualification:probe:idle:continue",
  },
  evidence: { busyCommandReceipt: "antigravity-desktop-sidecar:busy-state-command-receipt" },
  reasons: {
    sourceContractMismatch: {
      code: "source-contract-mismatch",
      meaning: "The exact qualified host, sidecar and runtime identity tuple does not match.",
    },
    conversationIdentityMissing: {
      code: "conversation-id-missing",
      meaning: "Native conversation creation returned no addressable identity.",
    },
    idleStateUnproven: {
      code: "idle-state-unproven",
      meaning: "Native inspection did not establish idle addressability.",
    },
    idleCommandRejected: {
      code: "idle-send-rejected",
      meaning: "The native idle continuation command was rejected.",
    },
    busyStateUnproven: {
      code: "busy-state-unproven",
      meaning: "Caller intent is not observed native busy state.",
    },
    busyTimingUnqualified: {
      code: "busy-turn-timing-unqualified",
      meaning: "Busy command acceptance does not prove delivery timing or processing.",
    },
    busyCommandRejected: {
      code: "busy-turn-rejected",
      meaning: "The native busy continuation command was rejected.",
    },
    probeError: {
      code: "probe-error",
      meaning: "A native probe operation failed; no qualification is asserted.",
    },
  },
  // Explanations are human prose; the facts retain the closed report vocabulary.
  explanations: {
    idleAddressabilityQualified:
      "Idle addressability is qualified through an observed idle state and accepted command. Recipient processing is unobservable.",
    busyTimingUnqualified:
      "Busy state and command receipt were observed. Recipient observation and delivery timing remain unqualified.",
    busyCommandRejected: "Busy state was observed, but the command was rejected.",
  },
} as const);
