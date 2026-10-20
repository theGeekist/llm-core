import { sidecarProbeContract } from "./probe-contract";
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
  readonly route: typeof sidecarProbeContract.routeProfileId;
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
  route: sidecarProbeContract.routeProfileId,
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
  client.sourceContract.identities.desktopApp.product === sidecarProbeContract.runtime.product &&
  client.sourceContract.identities.desktopApp.version === ANTIGRAVITY_DESKTOP_HOST_VERSION &&
  client.sourceContract.identities.desktopApp.bundleId === sidecarProbeContract.runtime.bundleId &&
  client.sourceContract.identities.sidecar.id === sidecarProbeContract.runtime.sidecarId &&
  client.sourceContract.identities.sidecar.supervised &&
  client.sourceContract.identities.sidecar.restartPolicy ===
    sidecarProbeContract.runtime.restartPolicy &&
  client.sourceContract.identities.agentapi.executable ===
    sidecarProbeContract.runtime.executable &&
  client.sourceContract.identities.agentapi.providerInjected &&
  client.sourceContract.identities.agentapi.path === sidecarProbeContract.runtime.executablePath;

const probeBusyTurn = async (
  client: AntigravityDesktopSidecarClient,
  scenario: NonNullable<ProbeOptions["activeTurnScenario"]>,
  idleAddressability: AntigravitySidecarProbeReport["idleAddressability"],
): Promise<AntigravitySidecarProbeReport> => {
  const busyConversation = await client.newConversation({
    prompt: scenario.initialPrompt,
  });
  const busyState = await client.inspectConversation(busyConversation.conversationId);
  if (busyState.state !== "busy") {
    return {
      ...base(client),
      outcome: "bounded-negative",
      idleAddressability,
      busyTurnTiming: untestedBusy(),
      reasonCode: sidecarProbeContract.reasons.busyStateUnproven.code,
    };
  }

  const busyReceipt = await client.sendMessage({
    conversationId: busyConversation.conversationId,
    prompt: scenario.followUpPrompt,
  });
  return {
    ...base(client),
    outcome: "bounded-negative",
    idleAddressability,
    busyTurnTiming: {
      classification: busyReceipt.accepted ? "unqualified" : "rejected",
      commandAcceptance: busyReceipt.accepted ? "observed" : "rejected",
      recipientObservation: "unobservable",
      semanticProcessing: "untested",
      timingEvidenceRef: sidecarProbeContract.evidence.busyCommandReceipt,
    },
    reasonCode: busyReceipt.accepted
      ? sidecarProbeContract.reasons.busyTimingUnqualified.code
      : sidecarProbeContract.reasons.busyCommandRejected.code,
    details: busyReceipt.accepted
      ? sidecarProbeContract.explanations.busyTimingUnqualified
      : sidecarProbeContract.explanations.busyCommandRejected,
  };
};

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
      reasonCode: sidecarProbeContract.reasons.sourceContractMismatch.code,
    };
  }

  try {
    const idleConversation = await client.newConversation({
      prompt: sidecarProbeContract.prompts.idleStart,
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
        reasonCode: sidecarProbeContract.reasons.conversationIdentityMissing.code,
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
        reasonCode: sidecarProbeContract.reasons.idleStateUnproven.code,
      };
    }

    const idleReceipt = await client.sendMessage({
      conversationId: idleConversation.conversationId,
      prompt: sidecarProbeContract.prompts.idleContinuation,
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
        reasonCode: sidecarProbeContract.reasons.idleCommandRejected.code,
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
        details: sidecarProbeContract.explanations.idleAddressabilityQualified,
      };
    }

    return await probeBusyTurn(client, options.activeTurnScenario, idleAddressability);
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
      reasonCode: sidecarProbeContract.reasons.probeError.code,
    };
  }
}
