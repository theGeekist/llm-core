import type { JsonValue } from "@geekist/llm-core/contracts";
import {
  validateNativeTaskAuthorityCommand,
  type NativeTaskAuthorityCommand,
  type TaskAuthorityServiceClientV2,
} from "@geekist/task-graph/task-authority";
import {
  nativeTaskAuthorityReceiptV2Digest,
  taskAuthorityServiceCommandDigest,
  taskAuthorityServiceRegistrationDigest,
  taskAuthorityServiceReservationIdentityDigest,
  validateAuthenticatedTaskAuthorityClient,
  validateNativeTaskAuthorityReceiptV2,
  validateTaskAuthorityServiceExecuteResult,
  validateTaskAuthorityServiceRegistrationIdentity,
  validateTaskAuthorityServiceReservationIdentity,
  type NativeTaskAuthorityReceiptV2,
} from "@geekist/task-graph/task-authority/service-contract";
import {
  createNativeTaskExecutionIntent,
  validateNativeTaskExecutionIntent,
} from "./intent-store.js";
import type {
  CorrelationId,
  EventId,
  EvidenceId,
  ProjectAuthority,
  ProjectObservation,
  ProjectResult,
} from "../../public.js";

export interface NativeTaskOperationBase {
  readonly correlationId: CorrelationId;
  readonly eventId: EventId;
  readonly leaseExpiresAt: string;
  readonly operationId: string;
  readonly projectId: string;
  readonly taskKey: string;
}

export interface ClaimTaskOperation extends NativeTaskOperationBase {
  readonly kind: "claimTask";
}

export interface DelegateTaskOperation extends NativeTaskOperationBase {
  readonly claimFence: string;
  readonly kind: "delegateWork";
  readonly targetOwner: { readonly id: string; readonly kind: string };
}

export type NativeTaskOperation = ClaimTaskOperation | DelegateTaskOperation;

export interface NativeTaskExecutionIntent {
  readonly authorityId: string;
  readonly integrityDigest: string;
  readonly operationDigest: string;
  readonly payload: JsonValue;
  readonly schemaVersion: 1;
}

export interface NativeTaskIntentReservation {
  readonly disposition: "already-present" | "reserved";
  readonly intent: NativeTaskExecutionIntent;
}

export interface NativeTaskIntentStore {
  readonly read: (
    operation: NativeTaskOperation,
  ) => Promise<ProjectResult<NativeTaskExecutionIntent | null>>;
  readonly reserve: (
    operation: NativeTaskOperation,
    intent: NativeTaskExecutionIntent,
  ) => Promise<ProjectResult<NativeTaskIntentReservation>>;
}

export interface NativeTaskOperator {
  readonly prepare: (
    operation: NativeTaskOperation,
  ) => Promise<ProjectResult<NativeTaskExecutionIntent>>;
  readonly execute: (
    operation: NativeTaskOperation,
    intent: NativeTaskExecutionIntent,
  ) => Promise<ProjectResult<{ readonly observation: ProjectObservation }>>;
}

export interface NativeTaskReceiptAuthority {
  readonly authorityId: string;
  readonly verify: (
    operation: NativeTaskOperation,
    intent: NativeTaskExecutionIntent,
    observation: ProjectObservation,
  ) => Promise<ProjectResult<{ readonly nativeResult: JsonValue }>>;
}

export {
  createInMemoryNativeTaskIntentStore,
  createNativeTaskExecutionIntent,
  createStoredNativeTaskIntentStore,
  nativeTaskOperationDigest,
  validateNativeTaskExecutionIntent,
  type NativeTaskIntentStorage,
  type StoredNativeTaskIntent,
} from "./intent-store.js";

const TASK_GRAPH_AUTHORITY = "task-graph/task-authority-service";
const CONTRACT_SCHEMA_VERSION = 1;

export interface TaskGraphNativeTaskAuthorityOptions {
  readonly client: TaskAuthorityServiceClientV2;
  readonly evidenceId: EvidenceId;
  readonly projectId: string;
  readonly sourceAuthority: ProjectAuthority;
}

export interface TaskGraphNativeTaskAuthority {
  readonly operator: NativeTaskOperator;
  readonly receipts: NativeTaskReceiptAuthority;
}

const rejected = <T = never>(): ProjectResult<T> => ({
  ok: false,
  diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

const commandFor = async (
  client: TaskAuthorityServiceClientV2,
  operation: NativeTaskOperation,
): Promise<NativeTaskAuthorityCommand> => {
  const inspection = await client.inspect(operation.taskKey);
  const common = {
    commandId: operation.eventId,
    expectedAdmissionRevision: inspection.admission.revision,
    expectedTaskRevision: inspection.admission.nativeAdmission.targetRevision,
    leaseExpiresAt: operation.leaseExpiresAt,
    schemaVersion: 1 as const,
    taskKey: operation.taskKey,
  };
  return operation.kind === "claimTask"
    ? { ...common, operation: "claim" }
    : {
        ...common,
        claimFence: operation.claimFence,
        operation: "delegate",
        targetOwner: operation.targetOwner,
      };
};

const sameOwner = (
  left: { readonly id: string; readonly kind: string },
  right: { readonly id: string; readonly kind: string },
): boolean => left.id === right.id && left.kind === right.kind;

const commandMatchesOperation = (
  command: NativeTaskAuthorityCommand,
  operation: NativeTaskOperation,
): boolean => {
  if (command.commandId !== operation.eventId || command.taskKey !== operation.taskKey)
    return false;
  if (operation.kind === "claimTask") {
    return command.operation === "claim" && command.leaseExpiresAt === operation.leaseExpiresAt;
  }
  return (
    command.operation === "delegate" &&
    command.leaseExpiresAt === operation.leaseExpiresAt &&
    command.claimFence === operation.claimFence &&
    sameOwner(command.targetOwner, operation.targetOwner)
  );
};

interface ValidatedTaskGraphIntent {
  readonly command: NativeTaskAuthorityCommand;
  readonly intent: NativeTaskExecutionIntent;
}

const validateTaskGraphIntent = (
  options: TaskGraphNativeTaskAuthorityOptions,
  operation: NativeTaskOperation,
  value: NativeTaskExecutionIntent,
): ValidatedTaskGraphIntent => {
  const intent = validateNativeTaskExecutionIntent(value, operation);
  if (
    intent.authorityId !== TASK_GRAPH_AUTHORITY ||
    !isRecord(intent.payload) ||
    !hasExactKeys(intent.payload, [
      "command",
      "projectRegistration",
      "reservationIdentity",
      "schemaVersion",
    ]) ||
    intent.payload.schemaVersion !== CONTRACT_SCHEMA_VERSION
  ) {
    throw new TypeError("Task Graph execution intent is invalid");
  }
  const command = validateNativeTaskAuthorityCommand(intent.payload.command);
  const registration = validateTaskAuthorityServiceRegistrationIdentity(
    intent.payload.projectRegistration,
  );
  const reservationIdentity = validateTaskAuthorityServiceReservationIdentity(
    intent.payload.reservationIdentity,
  );
  const configured = validateTaskAuthorityServiceRegistrationIdentity(
    options.client.projectRegistration,
  );
  const configuredReservationIdentity = validateTaskAuthorityServiceReservationIdentity(
    options.client.reservationIdentity,
  );
  if (
    !commandMatchesOperation(command, operation) ||
    taskAuthorityServiceRegistrationDigest(registration) !==
      taskAuthorityServiceRegistrationDigest(configured) ||
    taskAuthorityServiceReservationIdentityDigest(reservationIdentity) !==
      taskAuthorityServiceReservationIdentityDigest(configuredReservationIdentity)
  ) {
    throw new TypeError("Task Graph execution intent does not match composition");
  }
  return { command, intent };
};

const receiptMatches = (
  receipt: NativeTaskAuthorityReceiptV2,
  command: NativeTaskAuthorityCommand,
  options: TaskGraphNativeTaskAuthorityOptions,
): boolean => {
  const registration = validateTaskAuthorityServiceRegistrationIdentity(
    options.client.projectRegistration,
  );
  const authenticatedClient = validateAuthenticatedTaskAuthorityClient(receipt.authenticatedClient);
  return (
    receipt.outcome === "applied" &&
    receipt.commandId === command.commandId &&
    receipt.taskKey === command.taskKey &&
    receipt.operation === command.operation &&
    receipt.admissionRevision === command.expectedAdmissionRevision &&
    receipt.commandDigest === taskAuthorityServiceCommandDigest(command) &&
    receipt.projectInstanceId === registration.projectInstanceId &&
    receipt.registrationRevision === registration.registrationRevision &&
    authenticatedClient.projectInstanceId === registration.projectInstanceId &&
    authenticatedClient.registrationRevision === registration.registrationRevision
  );
};

interface ReceiptObservationInput {
  readonly command: NativeTaskAuthorityCommand;
  readonly intent: NativeTaskExecutionIntent;
  readonly operation: NativeTaskOperation;
  readonly options: TaskGraphNativeTaskAuthorityOptions;
  readonly receipt: NativeTaskAuthorityReceiptV2;
}

const receiptObservation = ({
  command,
  intent,
  operation,
  options,
  receipt,
}: ReceiptObservationInput): ProjectObservation => ({
  observationId: `task-authority-receipt:${receipt.receiptId}`,
  projectId: options.projectId,
  kind: "observation.accepted",
  sourceAuthority: options.sourceAuthority,
  provenance: {
    sourceKind: "integration",
    sourceRef: options.client.projectRegistration.projectInstanceId,
    ...(receipt.afterRevision === null ? {} : { revision: receipt.afterRevision }),
  },
  evidence: [options.evidenceId],
  correlationId: operation.correlationId,
  observedAt: receipt.completedAt,
  payload: {
    kind: "native-task-authority-receipt",
    replayProof: {
      authority: TASK_GRAPH_AUTHORITY,
      command,
      intentDigest: intent.integrityDigest,
      nativeReceipt: receipt,
      projectRegistration: options.client.projectRegistration,
      receiptDigest: nativeTaskAuthorityReceiptV2Digest(receipt),
      schemaVersion: CONTRACT_SCHEMA_VERSION,
    },
  } as unknown as JsonValue,
});

interface ReplayValidationInput {
  readonly intent: NativeTaskExecutionIntent;
  readonly observation: ProjectObservation;
  readonly operation: NativeTaskOperation;
  readonly options: TaskGraphNativeTaskAuthorityOptions;
}

const validateReplay = async ({
  intent: intentValue,
  observation,
  operation,
  options,
}: ReplayValidationInput): Promise<ProjectResult<{ readonly nativeResult: JsonValue }>> => {
  try {
    const { command, intent } = validateTaskGraphIntent(options, operation, intentValue);
    if (
      operation.projectId !== options.projectId ||
      observation.projectId !== options.projectId ||
      observation.correlationId !== operation.correlationId ||
      observation.kind !== "observation.accepted" ||
      observation.sourceAuthority.authorityId !== options.sourceAuthority.authorityId ||
      observation.sourceAuthority.kind !== options.sourceAuthority.kind ||
      observation.provenance.sourceKind !== "integration" ||
      observation.provenance.sourceRef !== options.client.projectRegistration.projectInstanceId ||
      observation.evidence.length !== 1 ||
      observation.evidence[0] !== options.evidenceId ||
      !isRecord(observation.payload) ||
      !hasExactKeys(observation.payload, ["kind", "replayProof"]) ||
      observation.payload.kind !== "native-task-authority-receipt" ||
      !isRecord(observation.payload.replayProof)
    ) {
      return rejected();
    }
    const proof = observation.payload.replayProof;
    if (
      !hasExactKeys(proof, [
        "authority",
        "command",
        "intentDigest",
        "nativeReceipt",
        "projectRegistration",
        "receiptDigest",
        "schemaVersion",
      ]) ||
      proof.authority !== TASK_GRAPH_AUTHORITY ||
      proof.schemaVersion !== CONTRACT_SCHEMA_VERSION ||
      proof.intentDigest !== intent.integrityDigest ||
      typeof proof.receiptDigest !== "string"
    ) {
      return rejected();
    }
    const proofCommand = validateNativeTaskAuthorityCommand(proof.command);
    const receipt = validateNativeTaskAuthorityReceiptV2(proof.nativeReceipt);
    const proofRegistration = validateTaskAuthorityServiceRegistrationIdentity(
      proof.projectRegistration,
    );
    const configuredRegistration = validateTaskAuthorityServiceRegistrationIdentity(
      options.client.projectRegistration,
    );
    if (
      taskAuthorityServiceCommandDigest(proofCommand) !==
        taskAuthorityServiceCommandDigest(command) ||
      taskAuthorityServiceRegistrationDigest(proofRegistration) !==
        taskAuthorityServiceRegistrationDigest(configuredRegistration) ||
      !receiptMatches(receipt, command, options) ||
      proof.receiptDigest !== nativeTaskAuthorityReceiptV2Digest(receipt) ||
      observation.observationId !== `task-authority-receipt:${receipt.receiptId}` ||
      observation.observedAt !== receipt.completedAt ||
      (receipt.afterRevision === null
        ? observation.provenance.revision !== undefined
        : observation.provenance.revision !== receipt.afterRevision)
    ) {
      return rejected();
    }
    const durableValue = await options.client.getReceipt(receipt.receiptId);
    const durable =
      durableValue === null ? null : validateNativeTaskAuthorityReceiptV2(durableValue);
    if (
      durable === null ||
      !receiptMatches(durable, command, options) ||
      nativeTaskAuthorityReceiptV2Digest(durable) !== nativeTaskAuthorityReceiptV2Digest(receipt)
    ) {
      return rejected();
    }
    return {
      ok: true,
      value: { nativeResult: { kind: "receipt", receipt } as unknown as JsonValue },
    };
  } catch {
    return rejected();
  }
};

const executionReceipt = async (
  options: TaskGraphNativeTaskAuthorityOptions,
  command: NativeTaskAuthorityCommand,
): Promise<NativeTaskAuthorityReceiptV2 | null> => {
  const result = validateTaskAuthorityServiceExecuteResult(await options.client.execute(command));
  if (result.kind === "receipt") return result.receipt;
  if (result.code !== "idempotency_conflict" || result.receiptId === undefined) return null;
  const recovered = await options.client.getReceipt(result.receiptId);
  return recovered === null ? null : validateNativeTaskAuthorityReceiptV2(recovered);
};

/**
 * AIFSD persists the exact prepared command before calling this operator.
 * Task Graph then owns cross-process idempotency for that commandId and digest.
 */
export const createTaskGraphNativeTaskAuthority = (
  options: TaskGraphNativeTaskAuthorityOptions,
): TaskGraphNativeTaskAuthority => ({
  operator: {
    prepare: async (operation) => {
      if (operation.projectId !== options.projectId) return rejected();
      try {
        const command = validateNativeTaskAuthorityCommand(
          await commandFor(options.client, operation),
        );
        return {
          ok: true,
          value: createNativeTaskExecutionIntent({
            authorityId: TASK_GRAPH_AUTHORITY,
            operation,
            payload: {
              command,
              projectRegistration: options.client.projectRegistration,
              reservationIdentity: options.client.reservationIdentity,
              schemaVersion: CONTRACT_SCHEMA_VERSION,
            } as unknown as JsonValue,
          }),
        };
      } catch {
        return rejected();
      }
    },
    execute: async (operation, intentValue) => {
      if (operation.projectId !== options.projectId) return rejected();
      try {
        const { command, intent } = validateTaskGraphIntent(options, operation, intentValue);
        const receipt = await executionReceipt(options, command);
        if (receipt === null || !receiptMatches(receipt, command, options)) return rejected();
        const observation = receiptObservation({ command, intent, operation, options, receipt });
        const verified = await validateReplay({ intent, observation, operation, options });
        return verified.ok ? { ok: true, value: { observation } } : verified;
      } catch {
        return rejected();
      }
    },
  },
  receipts: {
    authorityId: TASK_GRAPH_AUTHORITY,
    verify: (operation, intent, observation) =>
      validateReplay({ intent, observation, operation, options }),
  },
});
