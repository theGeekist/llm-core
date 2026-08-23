import { readFile, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  createArchitectureTaskPlan,
  parseTaskFrontMatter,
  scopesOverlap,
  type ArchitectureDecision,
  type ArchitectureTask,
  type ScopeAlias,
  type TaskPlanConfiguration,
} from "@geekist/task-graph";
import {
  authorityLocations,
  loadAuthority,
  loadTaskGraphRuntime,
  readingSourceAliases,
  validateGoverningReading,
  validateTaskReadings,
} from "@geekist/task-graph/node";
import { parseGitDirtyPaths } from "@geekist/task-graph/cli";
import { externalId } from "@geekist/llm-core/contracts";
import { contentDigest } from "../../../config/content-digest.js";
import type { ProjectObservation, ProjectProvenance, ProjectResult } from "../../public.js";
import { repositoryCorpusObservation, repositoryCorpusSnapshotDigest } from "./observations.js";
import type {
  RepositoryCommandPort,
  RepositoryCommandResult,
  RepositoryCorpusAdapter,
  RepositoryCorpusImport,
  RepositoryCorpusSource,
  RepositoryDocumentIdentity,
  RepositoryDocumentPort,
  RepositoryGitPort,
  RepositoryGitState,
  RepositoryTaskLifecycle,
  RepositoryTaskContext,
  RepositoryTaskPlan,
  RepositoryStatusProjection,
} from "./public.js";

interface LoadedCorpus {
  readonly decisions: readonly ArchitectureDecision[];
  readonly project: RepositoryCorpusImport["project"];
  readonly revision: string;
  readonly runtime: ReturnType<typeof loadTaskGraphRuntime>;
  readonly state: RepositoryGitState;
  readonly statuses: readonly RepositoryStatusProjection[];
  readonly tasks: readonly RepositoryCorpusImport["tasks"][number][];
}

const repositoryProjectId = (projectId: string): string => `repository:${projectId}`;

const failure = <T = never>(): ProjectResult<T> => ({
  ok: false,
  diagnostics: [{ code: "invalid-observation", reasonCode: "required-field-missing" }],
});

const taskLifecycle = (
  content: string,
  path: string,
  configuration: TaskPlanConfiguration,
): RepositoryTaskLifecycle => {
  const fields = parseTaskFrontMatter(content, path, configuration);
  const optional = (name: string): string | undefined =>
    typeof fields[name] === "string" && fields[name] !== "" ? String(fields[name]) : undefined;
  return {
    ...(optional("owner") === undefined ? {} : { owner: optional("owner") }),
    ...(optional("owner_kind") === undefined ? {} : { ownerKind: optional("owner_kind") }),
    ...(optional("lease_started_at") === undefined
      ? {}
      : { leaseStartedAt: optional("lease_started_at") }),
    ...(optional("lease_expires_at") === undefined
      ? {}
      : { leaseExpiresAt: optional("lease_expires_at") }),
    ...(optional("worktree") === undefined ? {} : { worktree: optional("worktree") }),
  };
};

interface TaskRecordInput {
  readonly configuration: TaskPlanConfiguration;
  readonly source: RepositoryCorpusSource;
  readonly task: ArchitectureTask;
  readonly workspaceRoot: string;
}

const taskRecord = async ({
  task,
  source,
  workspaceRoot,
  configuration,
}: TaskRecordInput): Promise<RepositoryCorpusImport["tasks"][number]> => {
  const content = await source.documents.readText(workspaceRoot, task.path);
  return {
    task,
    lifecycle: taskLifecycle(content, task.path, configuration),
    contentDigest: contentDigest(content),
  };
};

const statusLifecycle = new Map([
  ["In progress", "in_progress"],
  ["Claimed", "claimed"],
  ["Ready", "ready"],
  ["Review", "review"],
  ["Blocked", "blocked"],
  ["Done", "done"],
  ["Proposed", "proposed"],
  ["Cancelled", "cancelled"],
]);

const statusTaskId = (line: string): string | null => {
  const entry = line.trimStart();
  const linkPrefix = "](tasks/";
  const linkSuffix = ".md)";
  if (!entry.startsWith("- [") || !entry.endsWith(linkSuffix)) return null;
  const prefixIndex = entry.indexOf(linkPrefix);
  if (prefixIndex < 3) return null;
  const taskId = entry.slice(prefixIndex + linkPrefix.length, -linkSuffix.length);
  if (taskId === "" || taskId.includes(")")) return null;
  return taskId;
};

const statusHeading = (line: string): string | undefined =>
  line.startsWith("## ") ? line.slice(3) : undefined;

interface StatusProjectionInput {
  readonly authority: string;
  readonly configuration: TaskPlanConfiguration;
  readonly source: RepositoryCorpusSource;
  readonly tasks: readonly ArchitectureTask[];
  readonly workspaceRoot: string;
}

const statusProjection = async ({
  authority,
  source,
  workspaceRoot,
  configuration,
  tasks,
}: StatusProjectionInput): Promise<RepositoryStatusProjection> => {
  const architectureRoot = configuration.authorities[authority]?.architectureRoot;
  if (architectureRoot === undefined) throw new Error(`Task Graph authority missing: ${authority}`);
  const path = join(architectureRoot, "STATUS.md");
  const content = await source.documents.readText(workspaceRoot, path);
  const lifecycleByTask: Record<string, string> = {};
  let currentLifecycle: string | null = null;
  for (const line of content.split("\n")) {
    const heading = statusHeading(line);
    if (heading !== undefined) {
      currentLifecycle = statusLifecycle.get(heading) ?? null;
      continue;
    }
    const taskId = statusTaskId(line);
    if (taskId !== null && currentLifecycle !== null) {
      lifecycleByTask[`${authority}/${taskId}`] = currentLifecycle;
    }
  }
  const expected = new Map(tasks.map((task) => [task.key, task.status]));
  const mismatches = [
    ...tasks.flatMap((task) =>
      lifecycleByTask[task.key] === task.status
        ? []
        : [`${task.key}: ${lifecycleByTask[task.key] ?? "missing"} != ${task.status}`],
    ),
    ...Object.keys(lifecycleByTask)
      .filter((key) => !expected.has(key))
      .map((key) => `${key}: not present in task corpus`),
  ];
  return {
    contentDigest: contentDigest(content),
    lifecycleByTask,
    matchesTaskLifecycle: mismatches.length === 0,
    mismatches,
    path,
  };
};

const sourceObservation = (
  import_: Omit<RepositoryCorpusImport, "observations">,
  source: RepositoryCorpusSource,
  observedAt: string,
): ProjectObservation => ({
  observationId: `repository-import:${import_.project.id}:${import_.revision}`,
  projectId: import_.projectId,
  kind: "observation.accepted",
  sourceAuthority: source.sourceAuthority,
  provenance: import_.provenance,
  evidence: [source.evidenceId],
  correlationId: externalId(`repository-import:${import_.project.id}:${import_.revision}`),
  observedAt,
  payload: {
    project: import_.project.id,
    revision: import_.revision,
    taskCount: import_.tasks.length,
    decisionCount: import_.decisions.length,
  },
});

const loadCorpus = async (source: RepositoryCorpusSource): Promise<LoadedCorpus> => {
  const runtime = loadTaskGraphRuntime(source.manifestPath, source.manifestPath);
  const configuredAuthorities = Object.keys(runtime.configuration.authorities);
  const locations = await authorityLocations(
    runtime.workspaceRoot,
    configuredAuthorities,
    runtime.configuration,
  );
  const loaded = await Promise.all(
    locations.map((location) =>
      loadAuthority(runtime.workspaceRoot, location, runtime.configuration),
    ),
  );
  const tasks = loaded.flatMap(({ tasks }) => tasks);
  const decisions = loaded.flatMap(({ decisions }) => decisions);
  const mounts = configuredAuthorities.flatMap((authority) => {
    const mount = runtime.configuration.authorities[authority]?.logicalMount;
    return mount === null || mount === undefined ? [] : [mount];
  });
  const [revision, state, taskRecords] = await Promise.all([
    source.git.revision(runtime.workspaceRoot),
    source.git.workspaceState(runtime.workspaceRoot, mounts),
    Promise.all(
      tasks.map((task) =>
        taskRecord({
          configuration: runtime.configuration,
          source,
          task,
          workspaceRoot: runtime.workspaceRoot,
        }),
      ),
    ),
  ]);
  const statuses = await Promise.all(
    configuredAuthorities.map((authority) =>
      statusProjection({
        authority,
        source,
        workspaceRoot: runtime.workspaceRoot,
        configuration: runtime.configuration,
        tasks: tasks.filter((task) => task.authority === authority),
      }),
    ),
  );
  return {
    decisions,
    project: runtime.project,
    revision,
    runtime,
    state,
    statuses,
    tasks: taskRecords,
  };
};

const planFrom = async (loaded: LoadedCorpus) => {
  for (const authority of Object.keys(loaded.runtime.configuration.authorities)) {
    validateGoverningReading(
      loaded.runtime.workspaceRoot,
      loaded.runtime.configuration.authorities[authority]!.governingReading,
      loaded.runtime.configuration,
    );
  }
  const sourceAliases = readingSourceAliases(
    loaded.runtime.workspaceRoot,
    loaded.runtime.configuration,
    loaded.tasks.flatMap(({ task }) => task.requiredReading.map(({ path }) => path)),
  );
  const scopeAliases = [...loaded.state.scopeAliases, ...sourceAliases.aliases];
  const unavailableReadingSources = validateTaskReadings({
    configuration: loaded.runtime.configuration,
    scopeAliases,
    scopesOverlap,
    tasks: loaded.tasks.map(({ task }) => task),
    workspaceRoot: loaded.runtime.workspaceRoot,
  });
  return createArchitectureTaskPlan({
    configuration: loaded.runtime.configuration,
    decisions: loaded.decisions,
    dirtyPaths: loaded.state.dirtyPaths,
    scopeAliases,
    tasks: loaded.tasks.map(({ task }) => task),
    unavailableReadingSources: [
      ...new Set([...sourceAliases.unavailable, ...unavailableReadingSources]),
    ],
  });
};

const repositoryProvenance = (
  loaded: LoadedCorpus,
  documents: readonly RepositoryDocumentIdentity[],
): ProjectProvenance => ({
  sourceKind: "repository",
  sourceRef: loaded.runtime.configPath,
  revision: loaded.revision,
  contentDigest: contentDigest({
    manifest: loaded.runtime.project,
    documents,
    statuses: loaded.statuses,
    tasks: loaded.tasks.map(({ contentDigest: digest, task }) => ({ digest, key: task.key })),
  }),
});

interface DocumentCandidate {
  readonly authority: string;
  readonly path: string;
  readonly ref: string | null;
  readonly role: RepositoryDocumentIdentity["role"];
}

const corpusDocuments = async (
  source: RepositoryCorpusSource,
  loaded: LoadedCorpus,
): Promise<readonly RepositoryDocumentIdentity[]> => {
  const candidates: readonly DocumentCandidate[] = [
    ...Object.entries(loaded.runtime.configuration.authorities).flatMap(
      ([authority, configuration]) =>
        configuration.governingReading.map((path) => ({
          authority,
          path,
          ref: null,
          role: "governing" as const,
        })),
    ),
    ...loaded.decisions.map((decision) => ({
      authority: decision.authority,
      path: decision.path,
      ref: null,
      role: "decision" as const,
    })),
    ...loaded.tasks.flatMap(({ task }) =>
      task.requiredReading.map((reading) => ({
        authority: task.authority,
        path: reading.path,
        ref: reading.ref,
        role: "required-reading" as const,
      })),
    ),
  ];
  const unique = [
    ...new Map(
      candidates.map((candidate) => [
        `${candidate.role}:${candidate.authority}:${candidate.path}:${candidate.ref ?? ""}`,
        candidate,
      ]),
    ).values(),
  ];
  return Promise.all(
    unique.map(async (candidate) => ({
      ...candidate,
      contentDigest: contentDigest(
        await source.documents.readText(
          loaded.runtime.workspaceRoot,
          candidate.path,
          candidate.ref,
        ),
      ),
    })),
  );
};

const importCorpus = async (
  source: RepositoryCorpusSource,
): Promise<ProjectResult<RepositoryCorpusImport>> => {
  try {
    const loaded = await loadCorpus(source);
    const plan = await planFrom(loaded);
    const documents = await corpusDocuments(source, loaded);
    const base = {
      decisions: loaded.decisions,
      documents,
      plan,
      project: loaded.project,
      projectId: repositoryProjectId(loaded.project.id),
      provenance: repositoryProvenance(loaded, documents),
      revision: loaded.revision,
      statuses: loaded.statuses,
      tasks: loaded.tasks,
    };
    const observation = sourceObservation(base, source, source.now());
    const import_ = { ...base, observations: [observation] };
    return { ok: true, value: import_ };
  } catch {
    return failure();
  }
};

const projectId = async (source: RepositoryCorpusSource): Promise<ProjectResult<string>> => {
  try {
    const runtime = loadTaskGraphRuntime(source.manifestPath, source.manifestPath);
    return { ok: true, value: repositoryProjectId(runtime.project.id) };
  } catch {
    return failure();
  }
};

const planCorpus = async (
  source: RepositoryCorpusSource,
): Promise<ProjectResult<RepositoryTaskPlan>> => {
  const imported = await importCorpus(source);
  return imported.ok
    ? {
        ok: true,
        value: {
          plan: imported.value.plan,
          provenance: imported.value.provenance,
          revision: imported.value.revision,
        },
      }
    : imported;
};

const compileTaskContext = async (
  source: RepositoryCorpusSource,
  taskKey: string,
): Promise<ProjectResult<RepositoryTaskContext>> => {
  const imported = await importCorpus(source);
  if (!imported.ok) return imported;
  const command = [
    ...source.taskGraphCommand,
    "--project-config",
    source.manifestPath,
    "--context",
    taskKey,
  ];
  const result = await source.command.run(command, {
    cwd: loadTaskGraphRuntime(source.manifestPath, source.manifestPath).workspaceRoot,
  });
  if (result.exitCode !== 0) return failure();
  return {
    ok: true,
    value: {
      command,
      outputDigest: contentDigest(result.stdout),
      provenance: imported.value.provenance,
      taskKey,
      text: result.stdout,
    },
  };
};

export const createRepositoryCorpusAdapter = (): RepositoryCorpusAdapter => ({
  compileTaskContext,
  import: importCorpus,
  plan: planCorpus,
  projectId,
});

const run = async (
  command: readonly string[],
  options: { readonly cwd: string },
): Promise<RepositoryCommandResult> => {
  const process = Bun.spawn([...command], { cwd: options.cwd, stderr: "pipe", stdout: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stderr, stdout };
};

const statusPaths = async (workspaceRoot: string): Promise<readonly string[]> => {
  const result = await run(["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: workspaceRoot,
  });
  if (result.exitCode !== 0) throw new Error(result.stderr);
  return parseGitDirtyPaths(result.stdout);
};

const gitRoot = async (workspaceRoot: string): Promise<string> => {
  const result = await run(["git", "rev-parse", "--show-toplevel"], { cwd: workspaceRoot });
  if (result.exitCode !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};

const gitRevision = async (workspaceRoot: string): Promise<string> => {
  const result = await run(["git", "rev-parse", "HEAD"], { cwd: workspaceRoot });
  if (result.exitCode !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};

const documentText = async (
  workspaceRoot: string,
  path: string,
  ref?: string | null,
): Promise<string> => {
  if (ref === undefined || ref === null) return readFile(join(workspaceRoot, path), "utf8");
  const result = await run(["git", "show", `${ref}:${path}`], { cwd: workspaceRoot });
  if (result.exitCode !== 0) throw new Error(result.stderr);
  return result.stdout;
};

const mountedState = async (
  workspaceRoot: string,
  logicalMounts: readonly string[],
): Promise<RepositoryGitState> => {
  const dirtyPaths = [...(await statusPaths(workspaceRoot))];
  const scopeAliases: ScopeAlias[] = [];
  for (const logicalMount of logicalMounts) {
    const physicalMount = await realpath(join(workspaceRoot, logicalMount));
    scopeAliases.push({ logical: logicalMount, physical: physicalMount });
    const privateRoot = await gitRoot(physicalMount);
    const privatePaths = await statusPaths(privateRoot);
    dirtyPaths.push(
      ...privatePaths.map((path) => {
        const mountRelative = relative(physicalMount, join(privateRoot, path));
        return mountRelative === "" ||
          (mountRelative !== ".." && !mountRelative.startsWith(`..${sep}`))
          ? join(logicalMount, mountRelative)
          : join(privateRoot, path);
      }),
    );
  }
  return { dirtyPaths, scopeAliases };
};

export const createNativeRepositoryCorpusPorts = (): {
  readonly command: RepositoryCommandPort;
  readonly documents: RepositoryDocumentPort;
  readonly git: RepositoryGitPort;
} => ({
  command: { run },
  documents: {
    readText: documentText,
  },
  git: {
    revision: gitRevision,
    workspaceState: mountedState,
  },
});

export const createRepositoryCorpusObservation = repositoryCorpusObservation;
export { repositoryCorpusSnapshotDigest };
