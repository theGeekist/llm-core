import { ANTIGRAVITY_DESKTOP_HOST_VERSION, ANTIGRAVITY_SIDECAR_CONTRACT_VERSION } from "./profile";
import type {
  AntigravityDesktopSidecarClient,
  AntigravitySidecarRuntimeIdentities,
} from "./protocol";

export type BusyTurnDeliveryClassification =
  | "native-live"
  | "execution-boundary"
  | "turn-boundary"
  | "unqualified"
  | "rejected";

export interface AntigravitySidecarProbeReport {
  readonly route: "antigravity.desktop-sidecar.agentapi";
  readonly outcome: "qualified" | "blocked" | "bounded-negative";
  readonly identities?: AntigravitySidecarRuntimeIdentities;
  readonly idleAddressability: {
    readonly disposition: "supported" | "unsupported";
    readonly commandAcceptance: "observed" | "rejected" | "untested";
    readonly recipientObservation: "observed" | "unobservable" | "untested";
    readonly semanticProcessing: "observed" | "untested";
  };
  readonly busyTurnTiming: {
    readonly classification: BusyTurnDeliveryClassification;
    readonly commandAcceptance: "observed" | "rejected" | "untested";
    readonly recipientObservation: "observed" | "unobservable" | "untested";
    readonly semanticProcessing: "observed" | "untested";
    readonly timingEvidenceRef?: string;
  };
  readonly reasonCode?: string;
  readonly details?: string;
}

export interface ProbeOptions {
  readonly activeTurnScenario?: {
    readonly initialPrompt: string;
    readonly followUpPrompt: string;
  };
}

const base = (
  client: AntigravityDesktopSidecarClient,
): Pick<AntigravitySidecarProbeReport, "route" | "identities"> => ({
  route: "antigravity.desktop-sidecar.agentapi",
  identities: client.sourceContract.identities,
});

const untestedBusy = (): AntigravitySidecarProbeReport["busyTurnTiming"] => ({
  classification: "unqualified",
  commandAcceptance: "untested",
  recipientObservation: "untested",
  semanticProcessing: "untested",
});

const sourceContractMatches = (client: AntigravityDesktopSidecarClient): boolean =>
  client.sourceContract.desktopHostVersion === ANTIGRAVITY_DESKTOP_HOST_VERSION &&
  client.sourceContract.sidecarContractVersion === ANTIGRAVITY_SIDECAR_CONTRACT_VERSION &&
  client.sourceContract.identities.desktopApp.product === "Antigravity Desktop" &&
  client.sourceContract.identities.desktopApp.version === ANTIGRAVITY_DESKTOP_HOST_VERSION &&
  client.sourceContract.identities.desktopApp.bundleId === "com.google.antigravity" &&
  client.sourceContract.identities.sidecar.id === "simple-chat-qualification" &&
  client.sourceContract.identities.sidecar.supervised &&
  client.sourceContract.identities.sidecar.restartPolicy === "never" &&
  client.sourceContract.identities.agentapi.executable === "agentapi" &&
  client.sourceContract.identities.agentapi.providerInjected &&
  client.sourceContract.identities.agentapi.path === "/usr/local/bin/agentapi";

/**
 * Qualifies addressability only from native state and command receipts. Provider
 * acceptance never upgrades recipient observation or semantic processing.
 */
export async function runAntigravityDesktopSidecarProbe(
  client: AntigravityDesktopSidecarClient,
  options: ProbeOptions = {},
): Promise<AntigravitySidecarProbeReport> {
  if (!sourceContractMatches(client)) {
    return {
      ...base(client),
      outcome: "blocked",
      idleAddressability: {
        disposition: "unsupported",
        commandAcceptance: "untested",
        recipientObservation: "untested",
        semanticProcessing: "untested",
      },
      busyTurnTiming: untestedBusy(),
      reasonCode: "source-contract-mismatch",
    };
  }

  try {
    const idleConversation = await client.newConversation({
      prompt: "qualification:probe:idle:start",
    });
    if (!idleConversation.conversationId) {
      return {
        ...base(client),
        outcome: "bounded-negative",
        idleAddressability: {
          disposition: "unsupported",
          commandAcceptance: "rejected",
          recipientObservation: "untested",
          semanticProcessing: "untested",
        },
        busyTurnTiming: untestedBusy(),
        reasonCode: "conversation-id-missing",
      };
    }

    const idleState = await client.inspectConversation(idleConversation.conversationId);
    if (idleState.state !== "idle") {
      return {
        ...base(client),
        outcome: "bounded-negative",
        idleAddressability: {
          disposition: "unsupported",
          commandAcceptance: "untested",
          recipientObservation: "untested",
          semanticProcessing: "untested",
        },
        busyTurnTiming: untestedBusy(),
        reasonCode: "idle-state-unproven",
      };
    }

    const idleReceipt = await client.sendMessage({
      conversationId: idleConversation.conversationId,
      prompt: "qualification:probe:idle:continue",
    });
    if (!idleReceipt.accepted) {
      return {
        ...base(client),
        outcome: "bounded-negative",
        idleAddressability: {
          disposition: "unsupported",
          commandAcceptance: "rejected",
          recipientObservation: "unobservable",
          semanticProcessing: "untested",
        },
        busyTurnTiming: untestedBusy(),
        reasonCode: "idle-send-rejected",
      };
    }

    const idleAddressability: AntigravitySidecarProbeReport["idleAddressability"] = {
      disposition: "supported",
      commandAcceptance: "observed",
      recipientObservation: "unobservable",
      semanticProcessing: "untested",
    };
    if (!options.activeTurnScenario) {
      return {
        ...base(client),
        outcome: "qualified",
        idleAddressability,
        busyTurnTiming: untestedBusy(),
        details:
          "Idle addressability is qualified through an observed idle state and accepted command. Recipient processing is unobservable.",
      };
    }

    const busyConversation = await client.newConversation({
      prompt: options.activeTurnScenario.initialPrompt,
    });
    const busyState = await client.inspectConversation(busyConversation.conversationId);
    if (busyState.state !== "busy") {
      return {
        ...base(client),
        outcome: "bounded-negative",
        idleAddressability,
        busyTurnTiming: untestedBusy(),
        reasonCode: "busy-state-unproven",
      };
    }

    const busyReceipt = await client.sendMessage({
      conversationId: busyConversation.conversationId,
      prompt: options.activeTurnScenario.followUpPrompt,
    });
    return {
      ...base(client),
      outcome: "qualified",
      idleAddressability,
      busyTurnTiming: {
        classification: busyReceipt.accepted ? "unqualified" : "rejected",
        commandAcceptance: busyReceipt.accepted ? "observed" : "rejected",
        recipientObservation: "unobservable",
        semanticProcessing: "untested",
        timingEvidenceRef: "antigravity-desktop-sidecar:busy-state-command-receipt",
      },
      ...(busyReceipt.accepted ? {} : { reasonCode: "busy-turn-rejected" }),
      details:
        "Busy state and command receipt were observed. Recipient observation and delivery timing remain unqualified.",
    };
  } catch {
    return {
      ...base(client),
      outcome: "blocked",
      idleAddressability: {
        disposition: "unsupported",
        commandAcceptance: "rejected",
        recipientObservation: "untested",
        semanticProcessing: "untested",
      },
      busyTurnTiming: untestedBusy(),
      reasonCode: "probe-error",
    };
  }
}
