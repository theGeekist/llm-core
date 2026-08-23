import type { NativeTaskIntentStore } from "../../packages/aifsd/src/application/headless-workbench/public.js";
import {
  createStoredNativeTaskIntentStore,
  type NativeTaskIntentStorage,
  type StoredNativeTaskIntent,
} from "../../packages/aifsd/src/project-semantics/adapters/native-task-authority/public.js";
import {
  createAtomicDocumentFile,
  type AtomicDocumentCommitPhase,
  type AtomicDocumentFileOptions,
} from "../../packages/aifsd/src/adapters/atomic-document-file.js";

const PROTOCOL_VERSION = "aifsd.native-task-intents/1";

export type FileNativeTaskIntentCommitPhase = AtomicDocumentCommitPhase;

export type FileNativeTaskIntentStoreOptions = AtomicDocumentFileOptions;

interface IntentDocument {
  readonly intents: readonly StoredNativeTaskIntent[];
  readonly protocolVersion: typeof PROTOCOL_VERSION;
}

const intentDocument = (value: unknown): IntentDocument => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("\0") !== ["intents", "protocolVersion"].sort().join("\0") ||
    (value as { readonly protocolVersion?: unknown }).protocolVersion !== PROTOCOL_VERSION ||
    !Array.isArray((value as { readonly intents?: unknown }).intents)
  ) {
    throw new TypeError("Stored native task intent document is invalid");
  }
  return value as IntentDocument;
};

const fileStorage = (
  filePath: string,
  options: FileNativeTaskIntentStoreOptions,
): NativeTaskIntentStorage => {
  const file = createAtomicDocumentFile<IntentDocument>({
    decode: intentDocument,
    encode: (document) => document,
    filePath,
    lockName: "native task intent",
    options,
  });
  return {
    load: async () => (await file.read())?.intents ?? [],
    transact: async (transition) => {
      const result = await file.transact(async (current) => {
        const transitioned = await transition(current?.intents ?? []);
        return {
          replacement:
            transitioned.records === null
              ? null
              : { intents: transitioned.records, protocolVersion: PROTOCOL_VERSION },
          value: transitioned.value,
        };
      });
      return result.value;
    },
  };
};

export const createFileNativeTaskIntentStore = (
  filePath: string,
  options: FileNativeTaskIntentStoreOptions = {},
): NativeTaskIntentStore => createStoredNativeTaskIntentStore(fileStorage(filePath, options));
