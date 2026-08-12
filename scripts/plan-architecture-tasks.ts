import { existsSync } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  authorityLocations,
  createArchitectureTaskPlan,
  loadAuthority,
  scopesOverlap,
  type ArchitectureTask,
  type ArchitectureTaskPlan,
  type ScopeAlias,
  type TaskPlanEntry,
} from "./architecture-task-plan";
import {
  taskPlanConfiguration,
  type TaskAuthority,
  type TaskPlanConfiguration,
} from "./architecture-task-plan.config";
import { validateGoverningReading, validateTaskReadings } from "./architecture-task-reading";
type OutputFormat = TaskPlanConfiguration["cli"]["formats"][number];
export interface Arguments {
  readonly authorities: readonly TaskAuthority[];
  readonly context: boolean;
  readonly format: OutputFormat;
  readonly task: string | null;
}
interface ParsedArgumentTokens {
  readonly context: boolean;
  readonly positional: readonly string[];
  readonly values: ReadonlyMap<string, string>;
}
interface OptionValueOptions {
  readonly argument: string;
  readonly configuration: TaskPlanConfiguration;
  readonly name: string;
  readonly remaining: Iterator<string>;
  readonly separator: number;
}
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const optionError = (message: string, detail: string): Error => new Error(`${message}: ${detail}`);
const optionValue = ({
  argument,
  configuration,
  name,
  remaining,
  separator,
}: OptionValueOptions): string => {
  const value = separator < 0 ? remaining.next().value : argument.slice(separator + 1);
  if (value === undefined || value === "" || (separator < 0 && value.startsWith("-"))) {
    throw optionError(configuration.messages.errors.missingOptionValue, name);
  }
  return value;
};
const parseArgumentTokens = (
  arguments_: readonly string[],
  configuration: TaskPlanConfiguration,
): ParsedArgumentTokens => {
  const names = configuration.cli.options;
  const copy = configuration.messages.errors;
  const values = new Map<string, string>();
  const seen = new Set<string>();
  const positional: string[] = [];
  const valueOptions = new Set([names.authority, names.format, names.task]);
  const knownOptions = new Set([...valueOptions, names.context]);
  const remaining = arguments_[Symbol.iterator]();
  let context = false;
  for (const argument of remaining) {
    const separator = argument.indexOf("=");
    const name = separator < 0 ? argument : argument.slice(0, separator);
    if (!knownOptions.has(name)) {
      if (argument.startsWith("-")) throw optionError(copy.unknownOption, name);
      positional.push(argument);
      continue;
    }
    if (seen.has(name)) throw optionError(copy.duplicateOption, name);
    seen.add(name);
    if (name === names.context) {
      if (separator >= 0) throw optionError(copy.optionDoesNotTakeValue, name);
      context = true;
      continue;
    }
    values.set(name, optionValue({ argument, configuration, name, remaining, separator }));
  }
  return { context, positional, values };
};
export const parseArguments = (
  arguments_: readonly string[],
  configuration: TaskPlanConfiguration = taskPlanConfiguration,
): Arguments => {
  const names = configuration.cli.options;
  const copy = configuration.messages.errors;
  const authorities = Object.keys(configuration.authorities) as TaskAuthority[];
  const { context, positional, values } = parseArgumentTokens(arguments_, configuration);
  if (positional.length > 1) {
    throw optionError(copy.unexpectedArgument, positional[1]!);
  }
  if (!context && (values.has(names.task) || positional.length > 0)) {
    const taskArgument = values.has(names.task) ? names.task : positional[0];
    throw optionError(copy.taskRequiresContext, taskArgument!);
  }
  if (values.has(names.task) && positional.length > 0) {
    throw optionError(copy.unexpectedArgument, positional[0]!);
  }
  if (context && values.has(names.format)) {
    throw optionError(copy.formatNotAllowedInContext, names.format);
  }
  const authority = values.get(names.authority) ?? configuration.cli.allAuthorities;
  if (
    authority !== configuration.cli.allAuthorities &&
    !authorities.includes(authority as TaskAuthority)
  ) {
    throw new Error(`${copy.unknownAuthority} ${authority}`);
  }
  const format = values.get(names.format) ?? configuration.cli.defaultFormat;
  if (!configuration.cli.formats.includes(format as OutputFormat)) {
    throw new Error(`${copy.unknownFormat} ${format}`);
  }
  return {
    authorities:
      authority === configuration.cli.allAuthorities ? authorities : [authority as TaskAuthority],
    context,
    format: format as OutputFormat,
    task: values.get(names.task) ?? positional[0] ?? null,
  };
};
export const parseGitDirtyPaths = (
  output: string,
  configuration: TaskPlanConfiguration = taskPlanConfiguration,
): readonly string[] => {
  const paths: string[] = [];
  const records = output.split("\0")[Symbol.iterator]();
  for (const record of records) {
    if (record === "") continue;
    if (record.length < 4 || record[2] !== " ") {
      throw new Error(configuration.messages.errors.invalidGitStatusEntry);
    }
    const status = record.slice(0, 2);
    paths.push(record.slice(3));
    if (!/[RC]/.test(status)) continue;
    const source = records.next().value;
    if (source === undefined || source === "") {
      throw new Error(configuration.messages.errors.invalidGitStatusEntry);
    }
    paths.push(source);
  }
  return paths;
};
const gitDirtyPaths = (root: string, mapPath: (path: string) => string): readonly string[] => {
  const result = Bun.spawnSync(["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: root,
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `${taskPlanConfiguration.messages.errors.gitStatusFailed} ${root}: ${result.stderr.toString().trim()}`,
    );
  }
  return parseGitDirtyPaths(result.stdout.toString()).map(mapPath);
};

const gitRoot = (path: string): string => {
  const result = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
    cwd: path,
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `${taskPlanConfiguration.messages.errors.cannotResolveGitRoot} ${path}: ${result.stderr.toString().trim()}`,
    );
  }
  return result.stdout.toString().trim();
};

const workspaceState = async (
  authorities: readonly TaskAuthority[],
): Promise<{
  readonly dirtyPaths: readonly string[];
  readonly scopeAliases: readonly ScopeAlias[];
}> => {
  const dirtyPaths = [...gitDirtyPaths(workspaceRoot, (path) => path)];
  const scopeAliases: ScopeAlias[] = [];
  for (const authority of authorities) {
    const logicalMount = taskPlanConfiguration.authorities[authority].logicalMount;
    if (logicalMount === null) continue;
    const physicalMount = await realpath(join(workspaceRoot, logicalMount));
    scopeAliases.push({ logical: logicalMount, physical: physicalMount });
    const privateRoot = gitRoot(physicalMount);
    dirtyPaths.push(
      ...gitDirtyPaths(privateRoot, (path) => {
        const absolute = join(privateRoot, path);
        const mountRelative = relative(physicalMount, absolute);
        return mountRelative === "" ||
          (mountRelative !== ".." && !mountRelative.startsWith(`..${sep}`))
          ? join(logicalMount, mountRelative)
          : absolute;
      }),
    );
  }
  return { dirtyPaths, scopeAliases };
};

const cell = (
  values: readonly string[],
  configuration: TaskPlanConfiguration = taskPlanConfiguration,
): string => (values.length === 0 ? configuration.messages.table.emptyCell : values.join("; "));

const entryLine = (
  { blockers, canStart, safetyBlockers, task }: TaskPlanEntry,
  showCanStart: boolean,
  configuration: TaskPlanConfiguration,
): string => {
  const priority =
    task.declaredPriority === null ? `${task.effectivePriority}*` : task.effectivePriority;
  const admission = showCanStart
    ? `${configuration.messages.table.canStart}=${String(canStart).padEnd(5)} `
    : "";
  return `${admission}${priority.padEnd(9)} ${task.status.padEnd(11)} ${task.key.padEnd(62)} ${cell([...blockers, ...safetyBlockers], configuration)}`;
};

export const renderTable = (
  plan: ArchitectureTaskPlan,
  configuration: TaskPlanConfiguration = taskPlanConfiguration,
): string => {
  const copy = configuration.messages.table;
  const section = (
    title: string,
    entries: readonly TaskPlanEntry[],
    showCanStart = false,
  ): readonly string[] => [
    title,
    ...(entries.length === 0
      ? [`  ${copy.none}`]
      : entries.map((entry) => `  ${entryLine(entry, showCanStart, configuration)}`)),
  ];
  return [
    copy.title,
    `${copy.defaultPriority}: ${plan.defaultPriority}`,
    `${copy.priority}: ${plan.priority ?? copy.none}`,
    copy.defaultedPriority,
    "",
    ...section(copy.active, plan.active),
    "",
    ...section(copy.candidates, plan.candidates, true),
    ...(plan.diagnostics.length === 0
      ? []
      : ["", copy.diagnostics, ...plan.diagnostics.map((item) => `  ${item}`)]),
  ].join("\n");
};

const renderJson = (plan: ArchitectureTaskPlan): string =>
  JSON.stringify(
    {
      active: plan.active.map(({ task }) => ({
        key: task.key,
        priority: task.effectivePriority,
        status: task.status,
      })),
      defaultPriority: plan.defaultPriority,
      diagnostics: plan.diagnostics,
      priority: plan.priority,
      tasks: plan.ordered.map(({ blockers, canStart, safetyBlockers, task }) => ({
        authority: task.authority,
        blockers,
        canStart,
        conflictsWith: task.conflictsWith,
        decisionDependencies: task.decisionDependencies,
        dependsOn: task.dependsOn,
        key: task.key,
        path: task.path,
        priority: task.effectivePriority,
        priorityDefaulted: task.declaredPriority === null,
        readScope: task.readScope,
        requiredReading: task.requiredReading,
        safetyBlockers,
        status: task.status,
        title: task.title,
        writeScope: task.writeScope,
      })),
      candidates: plan.candidates.map(({ blockers, canStart, safetyBlockers, task }) => ({
        canStart,
        key: task.key,
        priority: task.effectivePriority,
        priorityDefaulted: task.declaredPriority === null,
        reasons: [...blockers, ...safetyBlockers],
        status: task.status,
      })),
    },
    null,
    2,
  );

export const selectPlanAuthorities = (
  plan: ArchitectureTaskPlan,
  authorities: readonly TaskAuthority[],
): ArchitectureTaskPlan => {
  const selected = new Set(authorities);
  const withinSelection = ({ task }: TaskPlanEntry): boolean => selected.has(task.authority);
  return {
    ...plan,
    active: plan.active.filter(withinSelection),
    candidates: plan.candidates.filter(withinSelection),
    ordered: plan.ordered.filter(withinSelection),
  };
};

const decisionPaths = async (task: ArchitectureTask): Promise<readonly string[]> => {
  const authority = taskPlanConfiguration.authorities[task.authority];
  const directory = join(
    workspaceRoot,
    authority.architectureRoot,
    taskPlanConfiguration.decisions.directory,
  );
  const files = await readdir(directory);
  return task.decisionDependencies.flatMap((id) => {
    const match = files.find(
      (file) =>
        file.startsWith(`${id}-`) && file.endsWith(taskPlanConfiguration.files.markdownExtension),
    );
    return match === undefined ? [] : [relative(workspaceRoot, join(directory, match))];
  });
};

export const renderContext = async (
  task: ArchitectureTask,
  entry: TaskPlanEntry,
  tasks: readonly ArchitectureTask[],
): Promise<string> => {
  const copy = taskPlanConfiguration.messages.context;
  const taskByKey = new Map(tasks.map((item) => [item.key, item]));
  const seen = new Set<string>();
  const mark = (key: string, label: string): string => {
    if (seen.has(key)) return `${label} (${copy.includedAbove})`;
    seen.add(key);
    return label;
  };
  const readingLabel = (path: string, ref: string | null): string =>
    ref === null ? path : `${path} (${copy.ref}: ${ref})`;
  const governing = taskPlanConfiguration.authorities[task.authority].governingReading.map((path) =>
    mark(path, path),
  );
  const selectedTask = [mark(task.path, task.path)];
  const historical = task.requiredReading.map((reading) => ({
    ...reading,
    label: mark(
      reading.ref === null ? reading.path : `${reading.path}@${reading.ref}`,
      readingLabel(reading.path, reading.ref),
    ),
  }));
  const decisions = (await decisionPaths(task)).map((path) => mark(path, path));
  const dependencies = task.dependsOn
    .flatMap((key) => {
      const dependency = taskByKey.get(key);
      return dependency === undefined ? [] : [dependency.path];
    })
    .map((path) => mark(path, path));
  const section = (title: string, lines: readonly string[]): readonly string[] => [
    `${title}:`,
    ...(lines.length === 0 ? [`- ${copy.noneDeclared}`] : lines),
  ];
  return [
    `${copy.task}: ${task.key}`,
    `${copy.title}: ${task.title}`,
    `${copy.status}: ${task.status}`,
    `${copy.priority}: ${task.effectivePriority}${
      task.declaredPriority === null ? ` (${copy.defaulted})` : ""
    }`,
    `${copy.blockers}: ${cell([...entry.blockers, ...entry.safetyBlockers])}`,
    "",
    ...section(
      copy.governingContext,
      governing.map((path) => `- ${path}`),
    ),
    "",
    ...section(
      copy.selectedTask,
      selectedTask.map((path) => `- ${path}`),
    ),
    "",
    ...section(
      copy.historicalContext,
      historical.flatMap(({ label, reason }) => [`- ${label}`, `  ${copy.why}: ${reason}`]),
    ),
    "",
    ...section(
      copy.decisionReading,
      decisions.map((path) => `- ${path}`),
    ),
    "",
    ...section(
      copy.dependencyBriefs,
      dependencies.map((path) => `- ${path}`),
    ),
    "",
    `${copy.additionalReadAuthority}:`,
    ...(task.readScope.length === 0
      ? [`- ${copy.noneDeclared}`]
      : task.readScope.map((path) => `- ${path}`)),
    "",
    `${copy.writeBoundary}:`,
    ...(task.writeScope.length === 0
      ? [`- ${copy.noneDeclared}`]
      : task.writeScope.map((path) => `- ${path}`)),
  ].join("\n");
};

const main = async (): Promise<void> => {
  const arguments_ = parseArguments(Bun.argv.slice(2));
  const configuredAuthorities = Object.keys(taskPlanConfiguration.authorities) as TaskAuthority[];
  const unavailableAuthorities = configuredAuthorities.filter(
    (authority) =>
      !existsSync(
        join(workspaceRoot, taskPlanConfiguration.authorities[authority].architectureRoot),
      ),
  );
  const requiredUnavailable = unavailableAuthorities.filter(
    (authority) => !taskPlanConfiguration.authorities[authority].optional,
  );
  if (
    requiredUnavailable.length > 0 ||
    arguments_.authorities.every((authority) => unavailableAuthorities.includes(authority))
  ) {
    throw new Error(
      `${taskPlanConfiguration.messages.errors.architectureAuthorityUnavailable}: ${unavailableAuthorities.join(", ")}`,
    );
  }
  const availableAuthorities = configuredAuthorities.filter(
    (authority) => !unavailableAuthorities.includes(authority),
  );
  const locations = await authorityLocations(
    workspaceRoot,
    availableAuthorities,
    taskPlanConfiguration,
  );
  const loaded = await Promise.all(
    locations.map((location) => loadAuthority(workspaceRoot, location, taskPlanConfiguration)),
  );
  const tasks = loaded.flatMap(({ tasks }) => tasks);
  const decisions = loaded.flatMap(({ decisions }) => decisions);
  const state = await workspaceState(availableAuthorities);
  for (const authority of availableAuthorities) {
    validateGoverningReading(
      workspaceRoot,
      taskPlanConfiguration.authorities[authority].governingReading,
      taskPlanConfiguration,
    );
  }
  const unavailableSources = validateTaskReadings({
    scopeAliases: state.scopeAliases,
    scopesOverlap,
    tasks,
    workspaceRoot,
  });
  const resolvedPlan = await createArchitectureTaskPlan({
    configuration: taskPlanConfiguration,
    decisions,
    dirtyPaths: state.dirtyPaths,
    scopeAliases: state.scopeAliases,
    tasks,
    unavailableAuthorities,
    unavailableReadingSources: unavailableSources,
  });
  const globalPlan: ArchitectureTaskPlan = {
    ...resolvedPlan,
    diagnostics: [
      ...resolvedPlan.diagnostics,
      ...unavailableAuthorities.map(
        (authority) =>
          `${authority}: ${taskPlanConfiguration.messages.plan.optionalAuthorityUnavailable}`,
      ),
    ],
  };
  const plan = selectPlanAuthorities(globalPlan, arguments_.authorities);
  if (!arguments_.context) {
    console.log(arguments_.format === "json" ? renderJson(plan) : renderTable(plan));
    return;
  }
  if (arguments_.task === null) {
    throw new Error(taskPlanConfiguration.messages.errors.contextTaskRequired);
  }
  const entry = plan.ordered.find(({ task }) => task.key === arguments_.task);
  if (entry === undefined) {
    throw new Error(`${taskPlanConfiguration.messages.errors.unknownTask} ${arguments_.task}`);
  }
  const task = entry.task;
  console.log(await renderContext(task, entry, tasks));
};

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
