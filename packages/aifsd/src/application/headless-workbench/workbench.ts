import type { EventId } from "@geekist/llm-core/contracts";
import type {
  AcceptedProjectEvent,
  JsonValue,
  MaterialisedAssertion,
  ProjectObservation,
  ProjectResult,
  RuntimeNeutralProjectView,
} from "../../project-semantics/public.js";
import { materialiseAssertions } from "../../project-semantics/public.js";
import { contentDigest } from "../../config/content-digest.js";
import {
  createRepositoryCorpusObservation,
  repositoryCorpusSnapshotDigest,
  type RepositoryTaskContext,
} from "../../project-semantics/adapters/repository-corpus/public.js";
import { renderHeadlessWorkbenchStatus } from "./status-projection.js";
import type {
  HeadlessWorkbench,
  HeadlessWorkbenchDependencies,
  HeadlessWorkbenchOperation,
  HeadlessWorkbenchOperationReceipt,
  NativeTaskOperation,
} from "./public.js";

const failure = <T = never>(): ProjectResult<T> => ({
  ok: false,
  diagnostics: [{ code: "invalid-observation", reasonCode: "required-field-missing" }],
});

const receipt = (
  operation: HeadlessWorkbenchOperation,
  values: Omit<HeadlessWorkbenchOperationReceipt, "correlationId" | "kind" | "operationId">,
): HeadlessWorkbenchOperationReceipt => ({
  correlationId: operation.correlationId,
  kind: operation.kind,
  operationId: operation.operationId,
  ...values,
});

const taskState = (view: RuntimeNeutralProjectView, taskKey: string) =>
  view.tasks.find(({ taskId }) => taskId === `task:${taskKey}`) ??
  view.tasks.find(({ taskId }) => taskId === taskKey) ??
  null;

const contextObservation = (
  operation: Extract<HeadlessWorkbenchOperation, { readonly kind: "compileTaskContext" }>,
  context: RepositoryTaskContext,
): ProjectObservation => ({
  observationId: `task-context:${operation.taskKey}:${context.outputDigest.value}`,
  projectId: operation.projectId,
  kind: "observation.accepted",
  sourceAuthority: operation.source.sourceAuthority,
  provenance: context.provenance,
  evidence: [operation.source.evidenceId],
  correlationId: operation.correlationId,
  observedAt: operation.source.now(),
  payload: {
    command: context.command,
    kind: "task-context-compiled",
    outputDigest: context.outputDigest,
    taskKey: operation.taskKey,
  } as unknown as ProjectObservation["payload"],
});

interface AdmissionSerialiser {
  readonly serialise: <T>(projectId: string, operation: () => Promise<T>) => Promise<T>;
}

const createAdmissionSerialiser = (): AdmissionSerialiser => {
  const tails = new Map<string, Promise<void>>();
  const serialise = async <T>(projectId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = tails.get(projectId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    tails.set(projectId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
      if (tails.get(projectId) === current) tails.delete(projectId);
    }
  };
  return { serialise };
};

interface AdmissionInput {
  readonly eventId: EventId;
  readonly observation: ProjectObservation;
  readonly operation: HeadlessWorkbenchOperation;
}

const admitProjectOperation = async (
  dependencies: HeadlessWorkbenchDependencies,
  input: AdmissionInput,
): Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>> => {
  const admitted = await dependencies.controlPlane.admit({
    eventId: input.eventId,
    observation: input.observation,
  });
  if (!admitted.ok) return admitted;
  return {
    ok: true,
    value: receipt(input.operation, {
      journal: {
        appendDisposition: admitted.value.append.disposition,
        checkpoint: admitted.value.append.checkpoint,
        event: admitted.value.append.event,
      },
      view: admitted.value.view,
    }),
  };
};

const projectAdmission = (
  dependencies: HeadlessWorkbenchDependencies,
  serialiser: AdmissionSerialiser,
  input: AdmissionInput,
): Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>> =>
  serialiser.serialise(input.observation.projectId, () =>
    admitProjectOperation(dependencies, input),
  );

const observationFromEvent = (event: AcceptedProjectEvent): ProjectObservation => ({
  observationId: event.observationId,
  projectId: event.projectId,
  kind: event.kind,
  sourceAuthority: event.sourceAuthority,
  provenance: event.provenance,
  evidence: event.evidence,
  ...(event.causationId === undefined ? {} : { causationId: event.causationId }),
  correlationId: event.correlationId,
  observedAt: event.observedAt,
  payload: event.payload,
});

const persistedNativeReplay = async (
  dependencies: HeadlessWorkbenchDependencies,
  operation: NativeTaskOperation,
): Promise<ProjectResult<HeadlessWorkbenchOperationReceipt> | null> => {
  const events = await dependencies.journal.read(operation.projectId);
  const event = events.find(({ eventId }) => eventId === operation.eventId);
  if (event === undefined) return null;
  if (
    dependencies.nativeTaskIntents === undefined ||
    dependencies.nativeTaskReceipts === undefined
  ) {
    return failure();
  }
  const storedIntent = await dependencies.nativeTaskIntents.read(operation);
  if (!storedIntent.ok) return storedIntent;
  if (storedIntent.value === null) return failure();
  const observation = observationFromEvent(event);
  const verified = await dependencies.nativeTaskReceipts.verify(
    operation,
    storedIntent.value,
    observation,
  );
  if (!verified.ok) return verified;
  const admitted = await admitProjectOperation(dependencies, {
    eventId: operation.eventId,
    observation,
    operation,
  });
  return admitted.ok
    ? { ok: true, value: { ...admitted.value, nativeResult: verified.value.nativeResult } }
    : admitted;
};

const nativeOperation = async (
  dependencies: HeadlessWorkbenchDependencies,
  serialiser: AdmissionSerialiser,
  operation: NativeTaskOperation,
): Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>> => {
  return serialiser.serialise(operation.projectId, async () => {
    const replay = await persistedNativeReplay(dependencies, operation);
    if (replay !== null) return replay;
    if (
      dependencies.nativeTaskIntents === undefined ||
      dependencies.nativeTaskReceipts === undefined
    ) {
      return failure();
    }
    const storedIntent = await dependencies.nativeTaskIntents.read(operation);
    if (!storedIntent.ok) return storedIntent;
    let intent = storedIntent.value;
    if (intent === null) {
      if (dependencies.nativeTasks === undefined) return failure();
      const prepared = await dependencies.nativeTasks.prepare(operation);
      if (!prepared.ok) return prepared;
      const reserved = await dependencies.nativeTaskIntents.reserve(operation, prepared.value);
      if (!reserved.ok) return reserved;
      intent = reserved.value.intent;
    }
    if (dependencies.nativeTasks === undefined) return failure();
    const native = await dependencies.nativeTasks.execute(operation, intent);
    if (!native.ok) return native;
    const verified = await dependencies.nativeTaskReceipts.verify(
      operation,
      intent,
      native.value.observation,
    );
    if (!verified.ok) return verified;
    const admitted = await admitProjectOperation(dependencies, {
      eventId: operation.eventId,
      observation: native.value.observation,
      operation,
    });
    return admitted.ok
      ? { ok: true, value: { ...admitted.value, nativeResult: verified.value.nativeResult } }
      : admitted;
  });
};

const directAdmission = (
  dependencies: HeadlessWorkbenchDependencies,
  serialiser: AdmissionSerialiser,
  operation: Extract<
    HeadlessWorkbenchOperation,
    { readonly kind: "admitTask" | "submitEvidence" | "acceptResult" }
  >,
): Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>> =>
  projectAdmission(dependencies, serialiser, {
    eventId: operation.eventId,
    observation: operation.observation,
    operation,
  });

const recordCorpus = async (
  dependencies: HeadlessWorkbenchDependencies,
  serialiser: AdmissionSerialiser,
  operation: Extract<HeadlessWorkbenchOperation, { readonly kind: "recordObservation" }>,
): Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>> => {
  const imported = await dependencies.corpus.import(operation.source);
  if (!imported.ok) return imported;
  const observation = createRepositoryCorpusObservation({
    correlationId: operation.correlationId,
    import_: imported.value,
    observationId: `repository-assertions:${imported.value.project.id}:${repositoryCorpusSnapshotDigest(imported.value).value}:${operation.eventId}`,
  });
  const events = await dependencies.journal.read(imported.value.projectId);
  if (events.some(({ eventId }) => eventId === operation.eventId)) {
    return projectAdmission(dependencies, serialiser, {
      eventId: operation.eventId,
      observation,
      operation,
    });
  }
  const materialised = materialiseAssertions(events);
  if (!materialised.ok) return materialised;
  const corpusEventIds = new Set(
    events
      .filter((event) => corpusAssertionEvent(event, operation.source))
      .map(({ eventId }) => eventId),
  );
  const current = materialised.value.filter(
    ({ retractedBy, sourceEventId }) => retractedBy === null && corpusEventIds.has(sourceEventId),
  );
  const replacements = assertionValues(observation);
  if (current.length > 0 && sameAssertionMeaning(current, replacements)) {
    const viewed = await dependencies.controlPlane.view(imported.value.projectId);
    return viewed.ok ? { ok: true, value: receipt(operation, { view: viewed.value }) } : viewed;
  }
  const prior = [...events]
    .reverse()
    .find((event) => corpusAssertionEvent(event, operation.source));
  if (current.length > 0 && prior !== undefined) {
    const correction: ProjectObservation = {
      ...observation,
      observationId: `repository-correction:${observation.observationId}`,
      kind: "correction.accepted",
      causationId: prior.eventId,
      payload: {
        assertionIds: current.map(({ assertionId }) => assertionId),
        assertions: replacements,
      } as unknown as ProjectObservation["payload"],
    };
    return projectAdmission(dependencies, serialiser, {
      eventId: operation.eventId,
      observation: correction,
      operation,
    });
  }
  return projectAdmission(dependencies, serialiser, {
    eventId: operation.eventId,
    observation,
    operation,
  });
};

const corpusAssertionEvent = (
  event: AcceptedProjectEvent,
  source: Extract<HeadlessWorkbenchOperation, { readonly kind: "recordObservation" }>["source"],
): boolean =>
  (event.kind === "assertions.recorded" || event.kind === "correction.accepted") &&
  event.sourceAuthority.authorityId === source.sourceAuthority.authorityId &&
  event.sourceAuthority.kind === source.sourceAuthority.kind &&
  event.provenance.sourceRef === source.manifestPath;

const assertionValues = (observation: ProjectObservation): readonly JsonValue[] => {
  const assertions = (observation.payload as { readonly assertions?: unknown }).assertions;
  return Array.isArray(assertions) ? (assertions as readonly JsonValue[]) : [];
};

const assertionMeaning = (assertion: {
  readonly authority?: unknown;
  readonly evidence?: unknown;
  readonly object?: unknown;
  readonly predicate?: unknown;
  readonly subjectId?: unknown;
}): string =>
  contentDigest({
    authority: assertion.authority,
    evidence: assertion.evidence,
    object: assertion.object,
    predicate: assertion.predicate,
    subjectId: assertion.subjectId,
  }).value;

const sameAssertionMeaning = (
  current: readonly MaterialisedAssertion[],
  replacements: readonly JsonValue[],
): boolean => {
  const replacementRecords = replacements.filter(
    (value): value is Record<string, JsonValue> =>
      value !== null && typeof value === "object" && !Array.isArray(value),
  );
  if (current.length !== replacementRecords.length) return false;
  const left = current.map(assertionMeaning).sort();
  const right = replacementRecords.map((value) => assertionMeaning(value)).sort();
  return left.every((value, index) => value === right[index]);
};

const compileContext = async (
  dependencies: HeadlessWorkbenchDependencies,
  serialiser: AdmissionSerialiser,
  operation: Extract<HeadlessWorkbenchOperation, { readonly kind: "compileTaskContext" }>,
): Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>> => {
  const expectedProject = await dependencies.corpus.projectId(operation.source);
  if (!expectedProject.ok) return expectedProject;
  if (expectedProject.value !== operation.projectId) return failure();
  const compiled = await dependencies.corpus.compileTaskContext(
    operation.source,
    operation.taskKey,
  );
  if (!compiled.ok) return compiled;
  const admitted = await projectAdmission(dependencies, serialiser, {
    eventId: operation.eventId,
    observation: contextObservation(operation, compiled.value),
    operation,
  });
  return admitted.ok
    ? { ok: true, value: { ...admitted.value, context: compiled.value } }
    : admitted;
};

const deriveReadiness = async (
  dependencies: HeadlessWorkbenchDependencies,
  operation: Extract<HeadlessWorkbenchOperation, { readonly kind: "deriveReadiness" }>,
): Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>> => {
  const rebuilt = await dependencies.controlPlane.rebuild(operation.projectId);
  return rebuilt.ok ? { ok: true, value: receipt(operation, { view: rebuilt.value }) } : rebuilt;
};

const explainBlockers = async (
  dependencies: HeadlessWorkbenchDependencies,
  operation: Extract<HeadlessWorkbenchOperation, { readonly kind: "explainBlockers" }>,
): Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>> => {
  const viewed = await dependencies.controlPlane.view(operation.projectId);
  if (!viewed.ok) return viewed;
  const task = taskState(viewed.value, operation.taskKey);
  return task === null
    ? failure()
    : {
        ok: true,
        value: receipt(operation, {
          task: {
            blockers: task.blockers,
            readiness: task.readiness,
            taskKey: operation.taskKey,
          },
          view: viewed.value,
        }),
      };
};

const projectStatus = async (
  dependencies: HeadlessWorkbenchDependencies,
  operation: Extract<HeadlessWorkbenchOperation, { readonly kind: "projectStatus" }>,
): Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>> => {
  const viewed = await dependencies.controlPlane.view(operation.projectId);
  return viewed.ok
    ? {
        ok: true,
        value: receipt(operation, {
          status: renderHeadlessWorkbenchStatus(viewed.value),
          view: viewed.value,
        }),
      }
    : viewed;
};

export const createHeadlessWorkbench = (
  dependencies: HeadlessWorkbenchDependencies,
): HeadlessWorkbench => {
  const serialiser = createAdmissionSerialiser();
  const dispatch = async (
    operation: HeadlessWorkbenchOperation,
  ): Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>> => {
    switch (operation.kind) {
      case "admitTask":
      case "submitEvidence":
      case "acceptResult":
        return directAdmission(dependencies, serialiser, operation);
      case "recordObservation":
        return recordCorpus(dependencies, serialiser, operation);
      case "compileTaskContext":
        return compileContext(dependencies, serialiser, operation);
      case "claimTask":
      case "delegateWork":
        return nativeOperation(dependencies, serialiser, operation);
      case "deriveReadiness":
        return deriveReadiness(dependencies, operation);
      case "explainBlockers":
        return explainBlockers(dependencies, operation);
      case "projectStatus":
        return projectStatus(dependencies, operation);
      default:
        return failure();
    }
  };
  return { dispatch };
};
