import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { makePipeline, type PipelineReporter, type PipelineStep } from "@wpkernel/pipeline";
import {
  taskPlanConfiguration,
  type TaskAuthority,
  type TaskPlanConfiguration,
  type TaskPriority,
  type TaskStatus,
} from "./architecture-task-plan.config";
import {
  optionalStringList,
  parseTaskFrontMatter,
  requiredString,
  requiredWriteScope,
} from "./architecture-task-frontmatter";
import {
  analyseActiveEntries,
  candidateSafety,
  taskBlockers,
  validateReferences,
} from "./architecture-task-admission";
import { parseRequiredReading, type RequiredReading } from "./architecture-task-reading";
import type { ScopeAlias } from "./architecture-task-scope";
export type {
  TaskAuthority,
  TaskPlanConfiguration,
  TaskPriority,
  TaskStatus,
} from "./architecture-task-plan.config";
export { scopesOverlap, type ScopeAlias } from "./architecture-task-scope";
export interface ArchitectureTask {
  readonly authority: TaskAuthority;
  readonly conflictsWith: readonly string[];
  readonly decisionDependencies: readonly string[];
  readonly declaredPriority: TaskPriority | null;
  readonly dependsOn: readonly string[];
  readonly effectivePriority: TaskPriority;
  readonly id: string;
  readonly key: string;
  readonly path: string;
  readonly readScope: readonly string[];
  readonly requiredReading: readonly RequiredReading[];
  readonly status: TaskStatus;
  readonly title: string;
  readonly writeScope: readonly string[];
}
export interface ArchitectureDecision {
  readonly authority: TaskAuthority;
  readonly id: string;
  readonly path: string;
  readonly status: string;
}
export interface TaskPlanEntry {
  readonly blockers: readonly string[];
  readonly canStart: boolean;
  readonly pipelineIndex: number;
  readonly safetyBlockers: readonly string[];
  readonly task: ArchitectureTask;
}

export interface ArchitectureTaskPlan {
  readonly active: readonly TaskPlanEntry[];
  readonly candidates: readonly TaskPlanEntry[];
  readonly defaultPriority: TaskPriority;
  readonly diagnostics: readonly string[];
  readonly ordered: readonly TaskPlanEntry[];
  readonly priority: TaskPriority | null;
}

interface PlanOptions {
  readonly configuration?: TaskPlanConfiguration;
  readonly decisions?: readonly ArchitectureDecision[];
  readonly dirtyPaths?: readonly string[];
  readonly scopeAliases?: readonly ScopeAlias[];
  readonly tasks: readonly ArchitectureTask[];
  readonly unavailableAuthorities?: readonly TaskAuthority[];
  readonly unavailableReadingSources?: readonly string[];
}

interface AuthorityLocation {
  readonly authority: TaskAuthority;
  readonly decisionRoot: string;
  readonly taskRoot: string;
}

interface ParseTaskOptions {
  readonly authority: TaskAuthority;
  readonly configuration?: TaskPlanConfiguration;
  readonly content: string;
  readonly path: string;
}

interface ParseDecisionOptions {
  readonly authority: TaskAuthority;
  readonly configuration: TaskPlanConfiguration;
  readonly content: string;
  readonly path: string;
}

const qualified = (authority: TaskAuthority, id: string): string =>
  id.includes("/") ? id : `${authority}/${id}`;

export const parseArchitectureTask = ({
  authority,
  configuration = taskPlanConfiguration,
  content,
  path,
}: ParseTaskOptions): ArchitectureTask => {
  const fields = parseTaskFrontMatter(content, path, configuration);
  const names = configuration.frontMatter;
  const id = requiredString(fields[names.id], {
    configuration,
    field: names.id,
    source: path,
  });
  const status = requiredString(fields[names.status], {
    configuration,
    field: names.status,
    source: path,
  });
  if (!configuration.lifecycle.allowed.includes(status as TaskStatus)) {
    throw new Error(`${path}: ${configuration.messages.errors.invalidStatus} ${status}`);
  }
  const rawPriority = fields[names.priority];
  if (
    rawPriority !== undefined &&
    !Object.hasOwn(configuration.priority.weights, String(rawPriority))
  ) {
    throw new Error(
      `${path}: ${configuration.messages.errors.invalidPriority} ${String(rawPriority)}`,
    );
  }
  const declaredPriority = (rawPriority as TaskPriority | undefined) ?? null;
  const rawTitle = fields[names.title];
  return {
    authority,
    conflictsWith: optionalStringList(fields[names.conflictsWith], {
      configuration,
      field: names.conflictsWith,
      source: path,
    }).map((id) => qualified(authority, id)),
    decisionDependencies: optionalStringList(fields[names.decisionDependencies], {
      configuration,
      field: names.decisionDependencies,
      source: path,
    }),
    declaredPriority,
    dependsOn: optionalStringList(fields[names.dependsOn], {
      configuration,
      field: names.dependsOn,
      source: path,
    }).map((id) => qualified(authority, id)),
    effectivePriority: declaredPriority ?? configuration.priority.default,
    id,
    key: `${authority}/${id}`,
    path,
    readScope: optionalStringList(fields[names.readScope], {
      configuration,
      field: names.readScope,
      source: path,
    }),
    requiredReading: parseRequiredReading(fields[names.requiredReading], configuration, path),
    status: status as TaskStatus,
    title: typeof rawTitle === "string" ? rawTitle : id,
    writeScope: requiredWriteScope(fields[names.writeScope], {
      configuration,
      field: names.writeScope,
      source: path,
    }),
  };
};

const parseDecision = ({
  authority,
  configuration,
  content,
  path,
}: ParseDecisionOptions): ArchitectureDecision => {
  const id = basename(path).match(configuration.decisions.filename)?.[1];
  if (id === undefined) {
    throw new Error(`${path}: ${configuration.messages.errors.decisionFilename}`);
  }
  const status = content.match(configuration.decisions.statusLine)?.[1]?.trim();
  if (status === undefined) {
    throw new Error(`${path}: ${configuration.messages.errors.decisionStatusMissing}`);
  }
  return { authority, id, path, status };
};

const markdownFiles = async (
  directory: string,
  configuration: TaskPlanConfiguration,
): Promise<readonly string[]> =>
  (await readdir(directory, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(configuration.files.markdownExtension) &&
        entry.name !== configuration.files.readme,
    )
    .map((entry) => join(directory, entry.name))
    .sort();

export const loadAuthority = async (
  workspaceRoot: string,
  location: AuthorityLocation,
  configuration: TaskPlanConfiguration = taskPlanConfiguration,
): Promise<{
  readonly decisions: readonly ArchitectureDecision[];
  readonly tasks: readonly ArchitectureTask[];
}> => {
  const [taskFiles, decisionFiles] = await Promise.all([
    markdownFiles(location.taskRoot, configuration),
    markdownFiles(location.decisionRoot, configuration),
  ]);
  const [tasks, decisions] = await Promise.all([
    Promise.all(
      taskFiles.map(async (path) =>
        parseArchitectureTask({
          authority: location.authority,
          configuration,
          content: await readFile(path, configuration.files.encoding),
          path: relative(workspaceRoot, path),
        }),
      ),
    ),
    Promise.all(
      decisionFiles.map(async (path) =>
        parseDecision({
          authority: location.authority,
          configuration,
          content: await readFile(path, configuration.files.encoding),
          path: relative(workspaceRoot, path),
        }),
      ),
    ),
  ]);
  return { decisions, tasks };
};

export const authorityLocations = async (
  workspaceRoot: string,
  authorities: readonly TaskAuthority[],
  configuration: TaskPlanConfiguration = taskPlanConfiguration,
): Promise<readonly AuthorityLocation[]> => {
  return authorities.map((authority) => {
    const authorityConfiguration = configuration.authorities[authority];
    const root = join(workspaceRoot, authorityConfiguration.architectureRoot);
    return {
      authority,
      decisionRoot: join(root, configuration.decisions.directory),
      taskRoot: join(root, configuration.files.tasksDirectory),
    };
  });
};

const pipelineOrder = async (
  tasks: readonly ArchitectureTask[],
  configuration: TaskPlanConfiguration,
): Promise<readonly string[]> => {
  type Reporter = PipelineReporter;
  type Kind = TaskPlanConfiguration["pipeline"]["helperKind"];
  const pipeline = makePipeline<
    Record<string, never>,
    { reporter: Reporter },
    Reporter,
    undefined,
    never,
    readonly PipelineStep<Kind>[],
    Kind
  >({
    helperKinds: [configuration.pipeline.helperKind],
    createContext: () => ({ reporter: {} }),
    createState: () => undefined,
    createRunResult: ({ steps }) => steps as readonly PipelineStep<Kind>[],
  });
  for (const task of tasks) {
    pipeline.use({
      apply: () => undefined,
      dependsOn: task.dependsOn,
      key: task.key,
      kind: configuration.pipeline.helperKind,
      mode: configuration.pipeline.helperMode,
      priority: configuration.priority.weights[task.effectivePriority],
    });
  }
  const result = await pipeline.run({});
  return result.map(({ key }) => key);
};

const prioritySort =
  (configuration: TaskPlanConfiguration) =>
  (left: TaskPlanEntry, right: TaskPlanEntry): number =>
    configuration.priority.weights[right.task.effectivePriority] -
      configuration.priority.weights[left.task.effectivePriority] ||
    left.pipelineIndex - right.pipelineIndex ||
    left.task.key.localeCompare(right.task.key);

export const createArchitectureTaskPlan = async ({
  configuration = taskPlanConfiguration,
  decisions = [],
  dirtyPaths = [],
  scopeAliases = [],
  tasks,
  unavailableAuthorities = [],
  unavailableReadingSources = [],
}: PlanOptions): Promise<ArchitectureTaskPlan> => {
  const messages = configuration.messages.plan;
  const references = validateReferences({
    configuration,
    decisions,
    tasks,
    unavailableAuthorities,
  });
  const orderedKeys = await pipelineOrder(tasks, configuration);
  const ordered = orderedKeys.map((key, pipelineIndex): TaskPlanEntry => {
    const task = references.taskByKey.get(key)!;
    const blockers = taskBlockers({ configuration, task, ...references });
    return { blockers, canStart: false, pipelineIndex, safetyBlockers: [], task };
  });
  const activeStatuses = new Set<TaskStatus>(configuration.lifecycle.active);
  const candidateStatuses = new Set<TaskStatus>(configuration.lifecycle.candidates);
  const activeTasks = ordered.filter(({ task }) => activeStatuses.has(task.status));
  const activeAnalysis = analyseActiveEntries(activeTasks, configuration, scopeAliases);
  const eligibleCandidates = ordered
    .filter(({ blockers, task }) => candidateStatuses.has(task.status) && blockers.length === 0)
    .sort(prioritySort(configuration));
  const priority = eligibleCandidates[0]?.task.effectivePriority ?? null;
  const evaluatedOrdered = ordered.map((entry): TaskPlanEntry => {
    if (activeStatuses.has(entry.task.status)) {
      return { ...entry, safetyBlockers: activeAnalysis.safetyByTask.get(entry.task.key) ?? [] };
    }
    if (!candidateStatuses.has(entry.task.status) || entry.blockers.length > 0) return entry;
    const safetyBlockers = candidateSafety({
      active: activeTasks,
      activeDiagnostics: activeAnalysis.diagnostics,
      aliases: scopeAliases,
      configuration,
      dirtyPaths,
      entry,
      priority,
      unavailableAuthorities,
      unavailableReadingSources,
    });
    return {
      ...entry,
      canStart: safetyBlockers.length === 0,
      safetyBlockers,
    };
  });
  const active = evaluatedOrdered.filter(({ task }) => activeStatuses.has(task.status));
  const evaluatedCandidates = evaluatedOrdered
    .filter(({ blockers, task }) => candidateStatuses.has(task.status) && blockers.length === 0)
    .sort(prioritySort(configuration));
  const diagnostics = tasks
    .filter(({ declaredPriority }) => declaredPriority === null)
    .map(({ key }) => `${key}: ${messages.omittedPriority} ${configuration.priority.default}`);
  diagnostics.push(
    ...activeAnalysis.diagnostics,
    ...unavailableReadingSources.map((source) => `${source}: ${messages.readingSourceUnavailable}`),
  );
  return {
    active,
    candidates: evaluatedCandidates,
    defaultPriority: configuration.priority.default,
    diagnostics,
    ordered: evaluatedOrdered,
    priority,
  };
};
