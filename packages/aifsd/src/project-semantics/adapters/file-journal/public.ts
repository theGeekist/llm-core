import type {
  AcceptedProjectEvent,
  ProjectContentDigester,
  ProjectEventJournal,
} from "../../public.js";
import { createStoredProjectJournal, type ProjectJournalStorage } from "../../journal.js";
import {
  createAtomicDocumentFile,
  type AtomicDocumentCommitPhase,
  type AtomicDocumentFileOptions,
} from "../../../adapters/atomic-document-file.js";

const PROTOCOL_VERSION = "aifsd.project-journal/1";

export type FileJournalCommitPhase = AtomicDocumentCommitPhase;

export type FileProjectJournalOptions = AtomicDocumentFileOptions;

interface ProjectJournalDocument {
  readonly events: readonly AcceptedProjectEvent[];
  readonly protocolVersion: typeof PROTOCOL_VERSION;
}

const journalDocument = (value: unknown): ProjectJournalDocument => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "events" && key !== "protocolVersion") ||
    (value as { readonly protocolVersion?: unknown }).protocolVersion !== PROTOCOL_VERSION ||
    !Array.isArray((value as { readonly events?: unknown }).events)
  ) {
    throw new TypeError("Stored project journal has an unsupported document shape");
  }
  return value as ProjectJournalDocument;
};

const fileStorage = (
  filePath: string,
  options: FileProjectJournalOptions,
): ProjectJournalStorage => {
  const file = createAtomicDocumentFile<ProjectJournalDocument>({
    decode: journalDocument,
    encode: (document) => document,
    filePath,
    lockName: "project journal",
    options,
  });
  const load = async (): Promise<readonly AcceptedProjectEvent[]> =>
    (await file.read())?.events ?? [];
  return {
    load,
    transact: async (transition) => {
      const result = await file.transact(async (current) => {
        const events = current?.events ?? [];
        const transitioned = await transition(events);
        return {
          replacement:
            transitioned.events === null
              ? null
              : { events: transitioned.events, protocolVersion: PROTOCOL_VERSION },
          value: transitioned.value,
        };
      });
      return { events: result.document?.events ?? [], value: result.value };
    },
  };
};

export const createFileProjectJournal = (
  filePath: string,
  digester: ProjectContentDigester,
  options: FileProjectJournalOptions = {},
): ProjectEventJournal => createStoredProjectJournal(digester, fileStorage(filePath, options));
