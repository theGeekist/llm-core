import { snapshot } from "@aifsd/strict-json";
import { digest, type EventId } from "@geekist/llm-core/contracts";
import type {
  AcceptedProjectEvent,
  JournalAppendResult,
  JournalCheckpoint,
  ProjectContentDigester,
  ProjectEventKind,
  ProjectEventJournal,
  ProjectAdmissionReceipt,
  ProjectResult,
} from "./contract.js";
import { isProjectAdmissionReceipt } from "./admission.js";
import { acceptedEventIdentityInput, sameDigest } from "./identity.js";
import { materialiseAssertions } from "./assertions.js";

const EMPTY_JOURNAL_DIGEST = digest(
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
);

const causationRequiredKinds = new Set<ProjectEventKind>([
  "correction.accepted",
  "reversal.accepted",
  "assertions.retracted",
]);

const checkpointFor = async (
  projectId: string,
  events: readonly AcceptedProjectEvent[],
  digester: ProjectContentDigester,
): Promise<JournalCheckpoint> => ({
  projectId,
  position: events.length,
  lastEventId: events.at(-1)?.eventId ?? null,
  journalDigest:
    events.length === 0
      ? EMPTY_JOURNAL_DIGEST
      : await digester.digest(events.map(({ eventDigest }) => eventDigest)),
});

const verifyEvent = async (
  event: AcceptedProjectEvent,
  digester: ProjectContentDigester,
): Promise<ProjectResult<AcceptedProjectEvent>> => {
  const payloadDigest = await digester.digest(event.payload);
  if (!sameDigest(payloadDigest, event.payloadDigest)) {
    return {
      ok: false,
      diagnostics: [{ code: "event-integrity-failed", reasonCode: "payload-digest-mismatch" }],
    };
  }
  const eventDigest = await digester.digest(acceptedEventIdentityInput(event));
  if (!sameDigest(eventDigest, event.eventDigest)) {
    return {
      ok: false,
      diagnostics: [{ code: "event-integrity-failed", reasonCode: "event-digest-mismatch" }],
    };
  }
  return { ok: true, value: event };
};

export const createInMemoryProjectJournal = (
  digester: ProjectContentDigester,
): ProjectEventJournal => {
  const projects = new Map<string, readonly AcceptedProjectEvent[]>();
  let serial = Promise.resolve();

  const append = async (
    receipt: ProjectAdmissionReceipt,
  ): Promise<ProjectResult<JournalAppendResult>> => {
    let result: ProjectResult<JournalAppendResult> | undefined;
    serial = serial.then(async () => {
      if (!isProjectAdmissionReceipt(receipt)) {
        result = {
          ok: false,
          diagnostics: [{ code: "invalid-admission", reasonCode: "admission-receipt-required" }],
        };
        return;
      }
      const event: AcceptedProjectEvent = receipt;
      const verified = await verifyEvent(event, digester);
      if (!verified.ok) {
        result = verified;
        return;
      }
      const current = projects.get(event.projectId) ?? [];
      const existing = current.find(({ eventId }) => eventId === event.eventId);
      if (existing) {
        if (!sameDigest(existing.eventDigest, event.eventDigest)) {
          result = {
            ok: false,
            diagnostics: [{ code: "journal-conflict", reasonCode: "event-id-conflict" }],
          };
          return;
        }
        result = {
          ok: true,
          value: {
            disposition: "already-present",
            event: existing,
            checkpoint: await checkpointFor(event.projectId, current, digester),
          },
        };
        return;
      }
      if (causationRequiredKinds.has(event.kind) && event.causationId === undefined) {
        result = {
          ok: false,
          diagnostics: [{ code: "causation-missing", reasonCode: "causation-not-admitted" }],
        };
        return;
      }
      if (
        event.causationId !== undefined &&
        !current.some(({ eventId }) => eventId === event.causationId)
      ) {
        result = {
          ok: false,
          diagnostics: [{ code: "causation-missing", reasonCode: "causation-not-admitted" }],
        };
        return;
      }
      const previousAdmittedAt = current.at(-1)?.admittedAt;
      if (
        !Number.isFinite(Date.parse(event.admittedAt)) ||
        (previousAdmittedAt !== undefined &&
          Date.parse(event.admittedAt) < Date.parse(previousAdmittedAt))
      ) {
        result = {
          ok: false,
          diagnostics: [{ code: "invalid-admission", reasonCode: "admission-time-regressed" }],
        };
        return;
      }
      const materialised = materialiseAssertions([...current, event]);
      if (!materialised.ok) {
        result = materialised;
        return;
      }
      const next = snapshot([...current, event]) as unknown as readonly AcceptedProjectEvent[];
      projects.set(event.projectId, next);
      result = {
        ok: true,
        value: {
          disposition: "appended",
          event,
          checkpoint: await checkpointFor(event.projectId, next, digester),
        },
      };
    });
    await serial;
    if (result === undefined) throw new Error("journal append completed without a result");
    return result;
  };

  return {
    append,
    read: async (projectId) => projects.get(projectId) ?? [],
    checkpoint: async (projectId) =>
      checkpointFor(projectId, projects.get(projectId) ?? [], digester),
  };
};

export const eventIdSet = (events: readonly AcceptedProjectEvent[]): ReadonlySet<EventId> =>
  new Set(events.map(({ eventId }) => eventId));
