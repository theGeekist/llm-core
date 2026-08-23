import { snapshot } from "@aifsd/strict-json";
import { digest, type EventId } from "@geekist/llm-core/contracts";
import type {
  AcceptedProjectEvent,
  AdmissionAuthority,
  AdmissionRequest,
  JournalAppendResult,
  JournalCheckpoint,
  ProjectContentDigester,
  ProjectEventKind,
  ProjectEventJournal,
  ProjectAdmissionReceipt,
  ProjectResult,
} from "./contract.js";
import { admitProjectEvent, isProjectAdmissionReceipt } from "./admission.js";
import {
  acceptedEventAdmissionRequestIdentityInput,
  acceptedEventIdentityInput,
  admissionRequestIdentityInput,
  sameDigest,
} from "./identity.js";
import { materialiseAssertions } from "./assertions.js";
import { validateAdmissionRequest } from "./validation.js";

const EMPTY_JOURNAL_DIGEST = digest(
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
);

const causationRequiredKinds = new Set<ProjectEventKind>([
  "correction.accepted",
  "reversal.accepted",
  "assertions.retracted",
]);

const findEventById = (
  projects: ReadonlyMap<string, readonly AcceptedProjectEvent[]>,
  eventId: EventId,
): AcceptedProjectEvent | undefined => {
  return [...projects.values()].flat().find((event) => event.eventId === eventId);
};

export interface ProjectJournalStorage {
  readonly load: () => Promise<readonly AcceptedProjectEvent[]>;
  readonly transact: <T>(
    transition: (events: readonly AcceptedProjectEvent[]) => Promise<{
      readonly events: readonly AcceptedProjectEvent[] | null;
      readonly value: T;
    }>,
  ) => Promise<{ readonly events: readonly AcceptedProjectEvent[]; readonly value: T }>;
}

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
): ProjectEventJournal => createProjectJournal(digester);

export const createStoredProjectJournal = (
  digester: ProjectContentDigester,
  storage: ProjectJournalStorage,
): ProjectEventJournal => createProjectJournal(digester, storage);

const createProjectJournal = (
  digester: ProjectContentDigester,
  storage?: ProjectJournalStorage,
): ProjectEventJournal => {
  let projects = new Map<string, readonly AcceptedProjectEvent[]>();
  let serial = Promise.resolve();

  const projectMap = async (
    stored: readonly AcceptedProjectEvent[],
  ): Promise<Map<string, readonly AcceptedProjectEvent[]>> => {
    const grouped = new Map<string, AcceptedProjectEvent[]>();
    const eventsById = new Map<EventId, AcceptedProjectEvent>();
    for (const candidate of stored) {
      const event = snapshot(candidate) as unknown as AcceptedProjectEvent;
      const existing = eventsById.get(event.eventId);
      if (existing !== undefined) {
        if (!sameDigest(existing.eventDigest, event.eventDigest)) {
          throw new TypeError("Stored project journal failed integrity checks");
        }
        continue;
      }
      const current = grouped.get(event.projectId) ?? [];
      const verified = await validateNextEvent(current, event, digester);
      if (!verified.ok) throw new TypeError("Stored project journal failed integrity checks");
      current.push(event);
      grouped.set(event.projectId, current);
      eventsById.set(event.eventId, event);
    }
    return new Map(
      [...grouped].map(([projectId, events]) => [
        projectId,
        snapshot(events) as unknown as readonly AcceptedProjectEvent[],
      ]),
    );
  };

  const persistedEvents = (
    currentProjects: ReadonlyMap<string, readonly AcceptedProjectEvent[]>,
  ): readonly AcceptedProjectEvent[] =>
    [...currentProjects.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .flatMap(([, events]) => events);

  const refresh = async (): Promise<void> => {
    if (storage !== undefined) projects = await projectMap(await storage.load());
  };

  const appendTo = async (
    currentProjects: Map<string, readonly AcceptedProjectEvent[]>,
    event: AcceptedProjectEvent,
  ): Promise<ProjectResult<JournalAppendResult>> => {
    const current = currentProjects.get(event.projectId) ?? [];
    const existing = findEventById(currentProjects, event.eventId);
    if (existing) {
      if (!sameDigest(existing.eventDigest, event.eventDigest)) {
        return {
          ok: false,
          diagnostics: [{ code: "journal-conflict", reasonCode: "event-id-conflict" }],
        };
      }
      return {
        ok: true,
        value: {
          disposition: "already-present",
          event: existing,
          checkpoint: await checkpointFor(
            existing.projectId,
            currentProjects.get(existing.projectId) ?? [],
            digester,
          ),
        },
      };
    }
    const verified = await validateNextEvent(current, event, digester);
    if (!verified.ok) return verified;
    const next = snapshot([...current, event]) as unknown as readonly AcceptedProjectEvent[];
    currentProjects.set(event.projectId, next);
    return {
      ok: true,
      value: {
        disposition: "appended",
        event,
        checkpoint: await checkpointFor(event.projectId, next, digester),
      },
    };
  };

  const admitTo = async (
    currentProjects: Map<string, readonly AcceptedProjectEvent[]>,
    request: AdmissionRequest,
    authority: AdmissionAuthority,
  ): Promise<ProjectResult<JournalAppendResult>> => {
    const current = currentProjects.get(request.observation.projectId) ?? [];
    const existing = findEventById(currentProjects, request.eventId);
    if (existing !== undefined) {
      const [existingRequestDigest, incomingRequestDigest] = await Promise.all([
        digester.digest(acceptedEventAdmissionRequestIdentityInput(existing)),
        digester.digest(admissionRequestIdentityInput(request)),
      ]);
      if (!sameDigest(existingRequestDigest, incomingRequestDigest)) {
        return {
          ok: false,
          diagnostics: [{ code: "journal-conflict", reasonCode: "event-id-conflict" }],
        };
      }
      return {
        ok: true,
        value: {
          disposition: "already-present",
          event: existing,
          checkpoint: await checkpointFor(
            existing.projectId,
            currentProjects.get(existing.projectId) ?? [],
            digester,
          ),
        },
      };
    }
    const admitted = await admitProjectEvent(request, authority, digester, {
      currentEvents: current,
      latestAdmittedAt: current.at(-1)?.admittedAt ?? null,
    });
    return admitted.ok ? appendTo(currentProjects, admitted.value) : admitted;
  };

  const commit = async (
    transition: (
      currentProjects: Map<string, readonly AcceptedProjectEvent[]>,
    ) => Promise<ProjectResult<JournalAppendResult>>,
  ): Promise<ProjectResult<JournalAppendResult>> => {
    if (storage === undefined) return transition(projects);
    const committed = await storage.transact(async (stored) => {
      const currentProjects = await projectMap(stored);
      const value = await transition(currentProjects);
      return {
        events:
          value.ok && value.value.disposition === "appended"
            ? persistedEvents(currentProjects)
            : null,
        value,
      };
    });
    projects = await projectMap(committed.events);
    return committed.value;
  };

  const serialise = async <T>(operation: () => Promise<T>): Promise<T> => {
    const current = serial.then(operation);
    serial = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  };

  const append = async (
    receipt: ProjectAdmissionReceipt,
  ): Promise<ProjectResult<JournalAppendResult>> =>
    serialise(async () => {
      if (!isProjectAdmissionReceipt(receipt)) {
        return {
          ok: false,
          diagnostics: [{ code: "invalid-admission", reasonCode: "admission-receipt-required" }],
        };
      }
      return commit((currentProjects) => appendTo(currentProjects, receipt));
    });

  const admit = async (
    request: AdmissionRequest,
    authority: AdmissionAuthority,
  ): Promise<ProjectResult<JournalAppendResult>> =>
    serialise(async () => {
      const validated = validateAdmissionRequest(request);
      if (!validated.ok) return validated;
      return commit((currentProjects) => admitTo(currentProjects, validated.value, authority));
    });

  return {
    admit,
    append,
    read: async (projectId) => {
      await serial;
      await refresh();
      return projects.get(projectId) ?? [];
    },
    checkpoint: async (projectId) => {
      await serial;
      await refresh();
      return checkpointFor(projectId, projects.get(projectId) ?? [], digester);
    },
  };
};

const validateNextEvent = async (
  current: readonly AcceptedProjectEvent[],
  event: AcceptedProjectEvent,
  digester: ProjectContentDigester,
): Promise<ProjectResult<AcceptedProjectEvent>> => {
  let verified: ProjectResult<AcceptedProjectEvent>;
  try {
    verified = await verifyEvent(event, digester);
  } catch {
    return {
      ok: false,
      diagnostics: [{ code: "event-integrity-failed", reasonCode: "event-digest-mismatch" }],
    };
  }
  if (!verified.ok) return verified;
  if (causationRequiredKinds.has(event.kind) && event.causationId === undefined) {
    return {
      ok: false,
      diagnostics: [{ code: "causation-missing", reasonCode: "causation-not-admitted" }],
    };
  }
  if (
    event.causationId !== undefined &&
    !current.some(({ eventId }) => eventId === event.causationId)
  ) {
    return {
      ok: false,
      diagnostics: [{ code: "causation-missing", reasonCode: "causation-not-admitted" }],
    };
  }
  const previousAdmittedAt = current.at(-1)?.admittedAt;
  if (
    !Number.isFinite(Date.parse(event.admittedAt)) ||
    (previousAdmittedAt !== undefined &&
      Date.parse(event.admittedAt) < Date.parse(previousAdmittedAt))
  ) {
    return {
      ok: false,
      diagnostics: [{ code: "invalid-admission", reasonCode: "admission-time-regressed" }],
    };
  }
  const materialised = materialiseAssertions([...current, event]);
  return materialised.ok ? verified : materialised;
};

export const eventIdSet = (events: readonly AcceptedProjectEvent[]): ReadonlySet<EventId> =>
  new Set(events.map(({ eventId }) => eventId));
