import {
  isCanonicalUuid,
  isContractVersion,
  isExternalId,
  isSchemaRef,
  type JsonValue,
} from "#contracts";
import type {
  CheckpointId,
  DurableExecutionHandle,
  LiveContinuation,
  ProviderSessionRef,
  RecordedEffect,
  RegisteredResumableCheckpoint,
  ResumableCheckpoint,
  Snapshot,
} from "./types";
import {
  clonePortable,
  deepFreeze,
  isCanonicalTimestamp,
  isRecordedEffect,
  validateCheckpoint,
} from "./validation";

const liveContinuations = new WeakSet<object>();
const registeredCheckpoints = new WeakSet<object>();

export const checkpointId = (value: string): CheckpointId => {
  if (!isCanonicalUuid(value)) {
    throw new TypeError("Checkpoint IDs must be canonical lowercase RFC 9562 UUIDs.");
  }
  return value as CheckpointId;
};

export const createLiveContinuation = <TValue>(value: TValue): LiveContinuation<TValue> => {
  const continuation = {
    kind: "live-continuation" as const,
    value,
    toJSON(): never {
      throw new TypeError("LiveContinuation is process-local and cannot be serialized.");
    },
  } as LiveContinuation<TValue>;
  liveContinuations.add(continuation);
  return Object.freeze(continuation);
};

export const isLiveContinuation = (value: unknown): value is LiveContinuation<unknown> =>
  typeof value === "object" && value !== null && liveContinuations.has(value);

export const createSnapshot = (input: {
  snapshotId: string;
  createdAt: string;
  schema?: Snapshot["schema"];
  value: JsonValue;
}): Snapshot => {
  if (
    !isExternalId(input.snapshotId) ||
    !isCanonicalTimestamp(input.createdAt) ||
    (input.schema !== undefined && !isSchemaRef(input.schema))
  ) {
    throw new TypeError("Snapshot identity and creation time must be valid.");
  }
  return deepFreeze({
    kind: "snapshot",
    snapshotId: input.snapshotId,
    createdAt: input.createdAt,
    ...(input.schema ? { schema: clonePortable(input.schema) } : {}),
    value: clonePortable(input.value),
  });
};

/**
 * The only entry into durable checkpoint resume. It validates, defensively
 * clones, freezes and nominally registers loaded portable data.
 */
export const registerResumableCheckpoint = (input: unknown): RegisteredResumableCheckpoint => {
  if (isLiveContinuation(input)) {
    throw new TypeError("LiveContinuation cannot enter durable checkpoint registration.");
  }
  const cloned = clonePortable(input) as ResumableCheckpoint;
  validateCheckpoint(cloned);
  const registered = deepFreeze(cloned) as RegisteredResumableCheckpoint;
  registeredCheckpoints.add(registered);
  return registered;
};

export const isRegisteredResumableCheckpoint = (
  value: unknown,
): value is RegisteredResumableCheckpoint =>
  typeof value === "object" && value !== null && registeredCheckpoints.has(value);

export const portableState = (value: unknown): JsonValue =>
  deepFreeze(clonePortable(value)) as JsonValue;

export const registerRecordedEffect = (input: unknown): RecordedEffect => {
  const cloned = clonePortable(input);
  if (!isRecordedEffect(cloned)) {
    throw new TypeError("Recorded effects must be closed portable receipt references.");
  }
  return deepFreeze(cloned);
};

export const createDurableExecutionHandle = (
  handle: DurableExecutionHandle,
): DurableExecutionHandle => {
  if (
    handle.kind !== "durable-execution-handle" ||
    !isCanonicalUuid(handle.durableJobId) ||
    !isExternalId(handle.opaqueHandle) ||
    !isExternalId(handle.runtime.runtimeId) ||
    !isContractVersion(handle.runtime.runtimeVersion)
  ) {
    throw new TypeError("Durable execution handles require runtime-owned opaque identity.");
  }
  return deepFreeze({ ...handle, runtime: { ...handle.runtime } });
};

export const createProviderSessionRef = (session: ProviderSessionRef): ProviderSessionRef => {
  if (
    session.kind !== "provider-session-ref" ||
    !isExternalId(session.providerId) ||
    !isExternalId(session.sessionId)
  ) {
    throw new TypeError("Provider session references require provider-owned opaque identity.");
  }
  return Object.freeze({ ...session });
};
