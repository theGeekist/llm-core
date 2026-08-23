import type { JsonValue } from "@geekist/llm-core/contracts";
import { contentDigest } from "../../../config/content-digest.js";
import type { ProjectObservation } from "../../public.js";
import type { RepositoryCorpusImport, RepositoryCorpusObservationInput } from "./public.js";

const taskSubject = (taskKey: string): string => `task:${taskKey}`;
const decisionSubject = (authority: string, decisionId: string): string =>
  `decision:${authority}/${decisionId}`;
const documentSubject = (document: RepositoryCorpusImport["documents"][number]): string =>
  `document:${document.role}:${document.authority}:${document.path}:${document.ref ?? ""}`;

interface AssertionIdentityInput {
  readonly object: JsonValue;
  readonly predicate: string;
  readonly snapshotId: string;
  readonly taskKey: string;
}

const assertionId = ({ snapshotId, taskKey, predicate, object }: AssertionIdentityInput): string =>
  `repository:${snapshotId}:${taskKey}:${predicate}:${contentDigest(object).value.slice(0, 16)}`;

interface AssertionInput {
  readonly object: JsonValue;
  readonly predicate: string;
  readonly source: ProjectObservation;
  readonly snapshotId: string;
  readonly subjectId?: string;
  readonly taskKey: string;
}

const assertion = ({
  source,
  snapshotId,
  taskKey,
  predicate,
  object,
  subjectId,
}: AssertionInput): JsonValue =>
  ({
    assertionId: assertionId({ snapshotId, taskKey, predicate, object }),
    subjectId: subjectId ?? taskSubject(taskKey),
    predicate,
    object,
    authority: source.sourceAuthority,
    evidence: source.evidence,
    validFrom: source.observedAt,
  }) as unknown as JsonValue;

interface TaskAssertionInput {
  readonly input: RepositoryCorpusObservationInput;
  readonly planEntry: RepositoryCorpusImport["plan"]["ordered"][number];
  readonly source: ProjectObservation;
  readonly snapshotId: string;
  readonly taskRecord: RepositoryCorpusImport["tasks"][number];
}

const taskAssertions = ({
  input,
  source,
  snapshotId,
  taskRecord,
  planEntry,
}: TaskAssertionInput): readonly JsonValue[] => {
  const { lifecycle, task } = taskRecord;
  const fromTask = (predicate: string, object: JsonValue) =>
    assertion({ source, snapshotId, taskKey: task.key, predicate, object });
  const common = [
    fromTask("entity.type", "task"),
    fromTask("task.completed", task.status === "done"),
    fromTask("task.lifecycle", task.status),
    fromTask("task.source-path", task.path),
    fromTask("task.revision", input.import_.revision),
    fromTask("task.title", task.title),
    fromTask("task.authority", task.authority),
    fromTask("task.priority", task.effectivePriority),
    fromTask("task.priority-declared", task.declaredPriority !== null),
  ];
  const dependencies = task.dependsOn.map((dependency) =>
    fromTask("task.depends-on", taskSubject(dependency)),
  );
  const conflicts = task.conflictsWith.map((conflict) =>
    fromTask("task.conflicts-with", taskSubject(conflict)),
  );
  const decisions = task.decisionDependencies.map((decisionId) =>
    fromTask("task.requires-decision", decisionSubject(task.authority, decisionId)),
  );
  const requiredReading = task.requiredReading.map((reading) => {
    const document = input.import_.documents.find(
      (candidate) =>
        candidate.role === "required-reading" &&
        candidate.authority === task.authority &&
        candidate.path === reading.path &&
        candidate.ref === reading.ref,
    );
    if (document === undefined)
      throw new Error(`Required reading identity omitted ${reading.path}`);
    return fromTask("task.required-reading", {
      contentDigest: document.contentDigest,
      documentId: documentSubject(document),
      path: reading.path,
      reason: reading.reason,
      ref: reading.ref,
      role: document.role,
    });
  });
  const readScope = task.readScope.map((scope) => fromTask("task.read-scope", scope));
  const writeScope = task.writeScope.map((scope) => fromTask("task.write-scope", scope));
  const blockers = [...planEntry.blockers, ...planEntry.safetyBlockers].map((blocker) =>
    fromTask("task.blocked-by", blocker),
  );
  const planner = [
    fromTask("task.planner-index", planEntry.pipelineIndex),
    fromTask("task.planner-can-start", planEntry.canStart),
    ...planEntry.blockers.map((blocker) => fromTask("task.planner-blocker", blocker)),
    ...planEntry.safetyBlockers.map((blocker) => fromTask("task.planner-safety-blocker", blocker)),
  ];
  const metadata = [
    lifecycle.owner === undefined ? [] : [fromTask("task.owner", lifecycle.owner)],
    lifecycle.ownerKind === undefined ? [] : [fromTask("task.owner-kind", lifecycle.ownerKind)],
    lifecycle.leaseStartedAt === undefined
      ? []
      : [fromTask("task.lease-started-at", lifecycle.leaseStartedAt)],
    lifecycle.leaseExpiresAt === undefined
      ? []
      : [fromTask("task.lease-expires-at", lifecycle.leaseExpiresAt)],
    lifecycle.worktree === undefined ? [] : [fromTask("task.worktree", lifecycle.worktree)],
  ];
  return [
    ...common,
    ...dependencies,
    ...conflicts,
    ...decisions,
    ...requiredReading,
    ...readScope,
    ...writeScope,
    ...blockers,
    ...planner,
    ...metadata.flat(),
  ];
};

const decisionAssertions = (
  input: RepositoryCorpusObservationInput,
  source: ProjectObservation,
  snapshotId: string,
): readonly JsonValue[] =>
  input.import_.decisions.flatMap((decision) => {
    const subjectId = decisionSubject(decision.authority, decision.id);
    const fromDecision = (predicate: string, object: JsonValue) =>
      assertion({
        object,
        predicate,
        source,
        snapshotId,
        subjectId,
        taskKey: `decision:${decision.authority}/${decision.id}`,
      });
    const document = input.import_.documents.find(
      (candidate) =>
        candidate.role === "decision" &&
        candidate.authority === decision.authority &&
        candidate.path === decision.path,
    );
    if (document === undefined) throw new Error(`Decision identity omitted ${decision.path}`);
    return [
      fromDecision("entity.type", "decision"),
      fromDecision("decision.authority", decision.authority),
      fromDecision("decision.identifier", decision.id),
      fromDecision("decision.lifecycle", decision.status),
      fromDecision("decision.source-path", decision.path),
      fromDecision("decision.source-document", documentSubject(document)),
      fromDecision("decision.revision", input.import_.revision),
    ];
  });

const documentAssertions = (
  input: RepositoryCorpusObservationInput,
  source: ProjectObservation,
  snapshotId: string,
): readonly JsonValue[] =>
  input.import_.documents.flatMap((document) => {
    const subjectId = documentSubject(document);
    const fromDocument = (predicate: string, object: JsonValue) =>
      assertion({
        object,
        predicate,
        source,
        snapshotId,
        subjectId,
        taskKey: subjectId,
      });
    return [
      fromDocument("entity.type", "document"),
      fromDocument("document.authority", document.authority),
      fromDocument("document.path", document.path),
      fromDocument("document.ref", document.ref),
      fromDocument("document.role", document.role),
      fromDocument("document.content-digest", document.contentDigest),
    ];
  });

const projectAssertions = (
  input: RepositoryCorpusObservationInput,
  source: ProjectObservation,
  snapshotId: string,
): readonly JsonValue[] => {
  const subjectId = `project:${input.import_.projectId}`;
  const fromProject = (predicate: string, object: JsonValue) =>
    assertion({
      object,
      predicate,
      source,
      snapshotId,
      subjectId,
      taskKey: `project:${input.import_.projectId}`,
    });
  return [
    fromProject("entity.type", "project"),
    fromProject("project.identifier", input.import_.project.id),
    fromProject("project.revision", input.import_.revision),
    fromProject("project.manifest", input.import_.provenance.sourceRef),
    ...(input.import_.provenance.contentDigest === undefined
      ? []
      : [fromProject("project.content-digest", input.import_.provenance.contentDigest)]),
    ...Object.entries(input.import_.project.authorities).flatMap(([authority, configuration]) => [
      fromProject("project.authority", authority),
      ...configuration.governingReading.map((path) => {
        const document = input.import_.documents.find(
          (candidate) =>
            candidate.role === "governing" &&
            candidate.authority === authority &&
            candidate.path === path,
        );
        if (document === undefined) throw new Error(`Governing identity omitted ${path}`);
        return fromProject("project.governing-reading", {
          authority,
          contentDigest: document.contentDigest,
          documentId: documentSubject(document),
          path,
          role: document.role,
        });
      }),
    ]),
    ...input.import_.plan.diagnostics.map((diagnostic) =>
      fromProject("project.planner-diagnostic", diagnostic),
    ),
  ];
};

const statusAssertions = (
  input: RepositoryCorpusObservationInput,
  source: ProjectObservation,
  snapshotId: string,
): readonly JsonValue[] =>
  input.import_.statuses.map((status) =>
    assertion({
      object: {
        contentDigest: status.contentDigest,
        matchesTaskLifecycle: status.matchesTaskLifecycle,
        mismatches: [...status.mismatches],
        path: status.path,
      },
      predicate: "project.status-projection",
      source,
      snapshotId,
      subjectId: `project:${input.import_.projectId}`,
      taskKey: `status:${status.path}`,
    }),
  );

/**
 * Translate only structured Task Graph output and task front matter into an
 * assertion event. Task prose never becomes an accepted project assertion.
 */
export const repositoryCorpusObservation = (
  input: RepositoryCorpusObservationInput,
): ProjectObservation => {
  const first = input.import_.observations[0];
  if (first === undefined) throw new Error("Repository corpus import has no source observation");
  const entryByKey = new Map(input.import_.plan.ordered.map((entry) => [entry.task.key, entry]));
  const snapshotId = contentDigest({
    observationId: input.observationId,
    snapshot: repositoryCorpusSnapshotDigest(input.import_),
  }).value.slice(0, 16);
  const assertions = [
    ...projectAssertions(input, first, snapshotId),
    ...documentAssertions(input, first, snapshotId),
    ...decisionAssertions(input, first, snapshotId),
    ...input.import_.tasks.flatMap((taskRecord) => {
      const entry = entryByKey.get(taskRecord.task.key);
      if (entry === undefined) throw new Error(`Task Graph plan omitted ${taskRecord.task.key}`);
      return taskAssertions({ input, source: first, snapshotId, taskRecord, planEntry: entry });
    }),
    ...statusAssertions(input, first, snapshotId),
  ];
  return {
    observationId: input.observationId,
    projectId: input.import_.projectId,
    kind: "assertions.recorded",
    sourceAuthority: first.sourceAuthority,
    provenance: input.import_.provenance,
    evidence: first.evidence,
    correlationId: input.correlationId,
    observedAt: first.observedAt,
    payload: { assertions },
  };
};

export const repositoryCorpusSnapshotDigest = (import_: RepositoryCorpusImport) =>
  contentDigest({
    plan: import_.plan.ordered.map(({ blockers, safetyBlockers, task }) => ({
      blockers,
      safetyBlockers,
      taskKey: task.key,
    })),
    projectId: import_.projectId,
    revision: import_.revision,
    statuses: import_.statuses,
    tasks: import_.tasks.map(({ contentDigest: digest, lifecycle, task }) => ({
      authority: task.authority,
      conflictsWith: task.conflictsWith,
      contentDigest: digest,
      decisionDependencies: task.decisionDependencies,
      dependsOn: task.dependsOn,
      key: task.key,
      lifecycle,
      path: task.path,
      readScope: task.readScope,
      requiredReading: task.requiredReading,
      status: task.status,
      writeScope: task.writeScope,
    })),
    decisions: import_.decisions,
    documents: import_.documents,
    planner: {
      diagnostics: import_.plan.diagnostics,
      ordered: import_.plan.ordered.map(
        ({ blockers, canStart, pipelineIndex, safetyBlockers, task }) => ({
          blockers,
          canStart,
          pipelineIndex,
          safetyBlockers,
          taskKey: task.key,
        }),
      ),
    },
  });

export const repositoryCorpusAssertionCount = (observation: ProjectObservation): number =>
  Array.isArray((observation.payload as { readonly assertions?: unknown }).assertions)
    ? ((observation.payload as unknown as { readonly assertions: readonly unknown[] }).assertions
        .length ?? 0)
    : 0;
