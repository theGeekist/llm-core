import type {
  ArchitectureDecision,
  ArchitectureTask,
  TaskPlanEntry,
} from "./architecture-task-plan";
import type {
  TaskAuthority,
  TaskPlanConfiguration,
  TaskPriority,
} from "./architecture-task-plan.config";
import { canonicalScope, scopesOverlap, type ScopeAlias } from "./architecture-task-scope";

export interface ReferenceState {
  readonly decisionByKey: ReadonlyMap<string, ArchitectureDecision>;
  readonly taskByKey: ReadonlyMap<string, ArchitectureTask>;
}

interface ReferenceOptions {
  readonly configuration: TaskPlanConfiguration;
  readonly decisions: readonly ArchitectureDecision[];
  readonly tasks: readonly ArchitectureTask[];
  readonly unavailableAuthorities: readonly TaskAuthority[];
}

export const validateReferences = ({
  configuration,
  decisions,
  tasks,
  unavailableAuthorities,
}: ReferenceOptions): ReferenceState => {
  const taskByKey = new Map(tasks.map((task) => [task.key, task]));
  if (taskByKey.size !== tasks.length) {
    throw new Error(configuration.messages.errors.duplicateTaskKey);
  }
  const unavailableOptionalAuthorities = new Set(
    unavailableAuthorities.filter((authority) => configuration.authorities[authority].optional),
  );
  for (const task of tasks) {
    for (const conflict of task.conflictsWith) {
      const conflictAuthority = conflict.slice(0, conflict.indexOf("/")) as TaskAuthority;
      if (!taskByKey.has(conflict) && !unavailableOptionalAuthorities.has(conflictAuthority)) {
        throw new Error(
          `${configuration.messages.errors.unknownConflictTarget} ${task.key}: ${conflict}`,
        );
      }
    }
  }
  const decisionKeys = decisions.map((decision) => `${decision.authority}/${decision.id}`);
  const duplicateDecision = decisionKeys.find((key, index) => decisionKeys.indexOf(key) !== index);
  if (duplicateDecision !== undefined) {
    throw new Error(`${configuration.messages.errors.duplicateDecisionKey} ${duplicateDecision}`);
  }
  return {
    decisionByKey: new Map(decisions.map((decision, index) => [decisionKeys[index]!, decision])),
    taskByKey,
  };
};

interface TaskBlockerOptions extends ReferenceState {
  readonly configuration: TaskPlanConfiguration;
  readonly task: ArchitectureTask;
}

export const taskBlockers = ({
  configuration,
  decisionByKey,
  task,
  taskByKey,
}: TaskBlockerOptions): readonly string[] => {
  const messages = configuration.messages.plan;
  const blockers: string[] = [];
  for (const dependency of task.dependsOn) {
    const dependencyTask = taskByKey.get(dependency);
    if (dependencyTask === undefined) blockers.push(`${messages.missingDependency} ${dependency}`);
    else if (dependencyTask.status !== configuration.lifecycle.dependencySatisfied) {
      blockers.push(`${messages.dependencyStatus} ${dependency}: ${dependencyTask.status}`);
    }
  }
  for (const decisionId of task.decisionDependencies) {
    const decision = decisionByKey.get(`${task.authority}/${decisionId}`);
    if (decision === undefined) {
      blockers.push(`${messages.missingDecision} ${task.authority}/${decisionId}`);
    } else if (decision.status !== configuration.decisions.acceptedStatus) {
      blockers.push(
        `${messages.decisionStatus} ${task.authority}/${decisionId}: ${decision.status}`,
      );
    }
  }
  if (task.status === configuration.lifecycle.blocked) blockers.push(messages.blockedLifecycle);
  return blockers;
};

export interface ActiveAnalysis {
  readonly diagnostics: readonly string[];
  readonly safetyByTask: ReadonlyMap<string, readonly string[]>;
}

const taskScopeOverlap = (
  left: ArchitectureTask,
  right: ArchitectureTask,
  aliases: readonly ScopeAlias[],
): boolean =>
  left.writeScope.some((leftScope) =>
    right.writeScope.some((rightScope) => scopesOverlap(leftScope, rightScope, aliases)),
  );

const taskConflict = (left: ArchitectureTask, right: ArchitectureTask): boolean =>
  left.conflictsWith.includes(right.key) || right.conflictsWith.includes(left.key);

export const analyseActiveEntries = (
  active: readonly TaskPlanEntry[],
  configuration: TaskPlanConfiguration,
  aliases: readonly ScopeAlias[],
): ActiveAnalysis => {
  const safetyByTask = new Map<string, string[]>();
  const diagnostics: string[] = [];
  const add = (key: string, blocker: string): void => {
    safetyByTask.set(key, [...(safetyByTask.get(key) ?? []), blocker]);
  };
  for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
    const left = active[leftIndex]!.task;
    for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex += 1) {
      const right = active[rightIndex]!.task;
      const message = taskConflict(left, right)
        ? configuration.messages.plan.activeConflict
        : taskScopeOverlap(left, right, aliases)
          ? configuration.messages.plan.activeOverlap
          : null;
      if (message === null) continue;
      add(left.key, `${message} ${right.key}`);
      add(right.key, `${message} ${left.key}`);
      diagnostics.push(`${left.key}: ${message} ${right.key}`);
    }
  }
  return { diagnostics, safetyByTask };
};

interface CandidateSafetyOptions {
  readonly active: readonly TaskPlanEntry[];
  readonly activeDiagnostics: readonly string[];
  readonly aliases: readonly ScopeAlias[];
  readonly configuration: TaskPlanConfiguration;
  readonly dirtyPaths: readonly string[];
  readonly entry: TaskPlanEntry;
  readonly priority: TaskPriority | null;
  readonly unavailableAuthorities: readonly TaskAuthority[];
  readonly unavailableReadingSources: readonly string[];
}

export const candidateSafety = ({
  active,
  activeDiagnostics,
  aliases,
  configuration,
  dirtyPaths,
  entry,
  priority,
  unavailableAuthorities,
  unavailableReadingSources,
}: CandidateSafetyOptions): readonly string[] => {
  const messages = configuration.messages.plan;
  const blockers = [
    ...activeDiagnostics,
    ...unavailableAuthorities.map(
      (authority) => `${messages.authoritySafetyUnavailable} ${authority}`,
    ),
    ...unavailableReadingSources.map(
      (source) => `${messages.readingSourceSafetyUnavailable} ${source}`,
    ),
  ];
  for (const activeEntry of active) {
    if (taskConflict(entry.task, activeEntry.task)) {
      blockers.push(`${messages.conflictActive} ${activeEntry.task.key}`);
    } else if (taskScopeOverlap(entry.task, activeEntry.task, aliases)) {
      blockers.push(`${messages.overlappingActive} ${activeEntry.task.key}`);
    }
  }
  const ownTaskPath = canonicalScope(entry.task.path, aliases);
  for (const dirtyPath of dirtyPaths) {
    const canonicalDirtyPath = canonicalScope(dirtyPath, aliases);
    if (
      canonicalDirtyPath !== ownTaskPath &&
      entry.task.writeScope.some((scope) => scopesOverlap(scope, dirtyPath, aliases))
    ) {
      blockers.push(`${messages.dirtyPath} ${canonicalDirtyPath}`);
    }
  }
  if (priority !== null && entry.task.effectivePriority !== priority) {
    blockers.push(`${messages.deferredByPriority} ${priority}`);
  }
  return [...new Set(blockers)];
};
