import type { JsonValue } from "@geekist/llm-core/contracts";
import { contentDigest } from "../../../config/content-digest.js";
import type {
  NativeTaskExecutionIntent,
  NativeTaskIntentReservation,
  NativeTaskIntentStore,
  NativeTaskOperation,
} from "./public.js";
import type { ProjectResult } from "../../public.js";

export interface StoredNativeTaskIntent {
  readonly eventId: string;
  readonly intent: NativeTaskExecutionIntent;
  readonly operation: NativeTaskOperation;
  readonly projectId: string;
}

export interface NativeTaskIntentStorage {
  readonly load: () => Promise<readonly unknown[]>;
  readonly transact: <T>(
    transition: (records: readonly unknown[]) => Promise<{
      readonly records: readonly StoredNativeTaskIntent[] | null;
      readonly value: T;
    }>,
  ) => Promise<T>;
}

const denied = <T = never>(): ProjectResult<T> => ({
  ok: false,
  diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

const sha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);

const nativeTaskOperation = (value: unknown): NativeTaskOperation => {
  if (!isRecord(value) || !nonBlank(value.kind)) {
    throw new TypeError("Native task operation is invalid");
  }
  const common = [
    "correlationId",
    "eventId",
    "kind",
    "leaseExpiresAt",
    "operationId",
    "projectId",
    "taskKey",
  ];
  const keys = value.kind === "claimTask" ? common : [...common, "claimFence", "targetOwner"];
  if (
    (value.kind !== "claimTask" && value.kind !== "delegateWork") ||
    !hasExactKeys(value, keys) ||
    !nonBlank(value.correlationId) ||
    !nonBlank(value.eventId) ||
    !nonBlank(value.leaseExpiresAt) ||
    !Number.isFinite(Date.parse(value.leaseExpiresAt)) ||
    !nonBlank(value.operationId) ||
    !nonBlank(value.projectId) ||
    !nonBlank(value.taskKey)
  ) {
    throw new TypeError("Native task operation is invalid");
  }
  if (value.kind === "delegateWork") {
    if (
      !nonBlank(value.claimFence) ||
      !isRecord(value.targetOwner) ||
      !hasExactKeys(value.targetOwner, ["id", "kind"]) ||
      !nonBlank(value.targetOwner.id) ||
      !nonBlank(value.targetOwner.kind)
    ) {
      throw new TypeError("Native delegation operation is invalid");
    }
  }
  contentDigest(value);
  return value as unknown as NativeTaskOperation;
};

export const nativeTaskOperationDigest = (operation: NativeTaskOperation): string =>
  contentDigest(nativeTaskOperation(operation)).value;

const intentBody = (intent: Omit<NativeTaskExecutionIntent, "integrityDigest">) => ({
  authorityId: intent.authorityId,
  operationDigest: intent.operationDigest,
  payload: intent.payload,
  schemaVersion: intent.schemaVersion,
});

export const createNativeTaskExecutionIntent = (input: {
  readonly authorityId: string;
  readonly operation: NativeTaskOperation;
  readonly payload: JsonValue;
}): NativeTaskExecutionIntent => {
  if (!nonBlank(input.authorityId)) throw new TypeError("Native intent authority is invalid");
  contentDigest(input.payload);
  const body = {
    authorityId: input.authorityId,
    operationDigest: nativeTaskOperationDigest(input.operation),
    payload: input.payload,
    schemaVersion: 1 as const,
  };
  return { ...body, integrityDigest: contentDigest(body).value };
};

export const validateNativeTaskExecutionIntent = (
  value: unknown,
  operation: NativeTaskOperation,
): NativeTaskExecutionIntent => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "authorityId",
      "integrityDigest",
      "operationDigest",
      "payload",
      "schemaVersion",
    ]) ||
    !nonBlank(value.authorityId) ||
    !sha256(value.integrityDigest) ||
    !sha256(value.operationDigest) ||
    value.schemaVersion !== 1
  ) {
    throw new TypeError("Native task intent is invalid");
  }
  contentDigest(value.payload);
  const intent = value as unknown as NativeTaskExecutionIntent;
  if (
    intent.operationDigest !== nativeTaskOperationDigest(operation) ||
    intent.integrityDigest !== contentDigest(intentBody(intent)).value
  ) {
    throw new TypeError("Native task intent integrity is invalid");
  }
  return intent;
};

const storedIntent = (value: unknown): StoredNativeTaskIntent => {
  if (!isRecord(value) || !hasExactKeys(value, ["eventId", "intent", "operation", "projectId"])) {
    throw new TypeError("Stored native task intent is invalid");
  }
  const operation = nativeTaskOperation(value.operation);
  if (value.eventId !== operation.eventId || value.projectId !== operation.projectId) {
    throw new TypeError("Stored native task intent identity is invalid");
  }
  return {
    eventId: operation.eventId,
    intent: validateNativeTaskExecutionIntent(value.intent, operation),
    operation,
    projectId: operation.projectId,
  };
};

const allStoredIntents = (values: readonly unknown[]): readonly StoredNativeTaskIntent[] => {
  const records = values.map(storedIntent);
  const identities = records.map(({ eventId, projectId }) => `${projectId}\0${eventId}`);
  if (new Set(identities).size !== identities.length) {
    throw new TypeError("Stored native task intent identity is duplicated");
  }
  return records;
};

const identityMatches = (record: StoredNativeTaskIntent, operation: NativeTaskOperation): boolean =>
  record.projectId === operation.projectId && record.eventId === operation.eventId;

export const createStoredNativeTaskIntentStore = (
  storage: NativeTaskIntentStorage,
): NativeTaskIntentStore => ({
  read: async (operation) => {
    try {
      const validatedOperation = nativeTaskOperation(operation);
      const existing = allStoredIntents(await storage.load()).find((record) =>
        identityMatches(record, validatedOperation),
      );
      if (existing === undefined) return { ok: true, value: null };
      return existing.intent.operationDigest === nativeTaskOperationDigest(validatedOperation)
        ? { ok: true, value: existing.intent }
        : denied();
    } catch {
      return denied();
    }
  },
  reserve: async (operation, intent) => {
    try {
      const validatedOperation = nativeTaskOperation(operation);
      const validatedIntent = validateNativeTaskExecutionIntent(intent, validatedOperation);
      return await storage.transact(async (values) => {
        const records = allStoredIntents(values);
        const existing = records.find((record) => identityMatches(record, validatedOperation));
        if (existing !== undefined) {
          const sameOperation =
            existing.intent.operationDigest === nativeTaskOperationDigest(validatedOperation);
          const sameIntent = existing.intent.integrityDigest === validatedIntent.integrityDigest;
          return {
            records: null,
            value:
              sameOperation && sameIntent
                ? ({
                    ok: true,
                    value: {
                      disposition: "already-present",
                      intent: existing.intent,
                    },
                  } satisfies ProjectResult<NativeTaskIntentReservation>)
                : denied<NativeTaskIntentReservation>(),
          };
        }
        const stored: StoredNativeTaskIntent = {
          eventId: validatedOperation.eventId,
          intent: validatedIntent,
          operation: validatedOperation,
          projectId: validatedOperation.projectId,
        };
        return {
          records: [...records, stored],
          value: {
            ok: true,
            value: { disposition: "reserved", intent: validatedIntent },
          } satisfies ProjectResult<NativeTaskIntentReservation>,
        };
      });
    } catch {
      return denied();
    }
  },
});

export const createInMemoryNativeTaskIntentStore = (): NativeTaskIntentStore => {
  let records: readonly StoredNativeTaskIntent[] = [];
  return createStoredNativeTaskIntentStore({
    load: async () => records,
    transact: async (transition) => {
      const result = await transition(records);
      if (result.records !== null) records = result.records;
      return result.value;
    },
  });
};
