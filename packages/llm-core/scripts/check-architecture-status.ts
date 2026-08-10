import { existsSync, realpathSync, statSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseTaskFrontMatter,
  type FrontMatterRecord,
} from "../../../scripts/architecture-task-frontmatter";
import {
  createArchitectureTaskPlan,
  parseArchitectureTask,
  type ArchitectureDecision,
  type ArchitectureTask,
} from "../../../scripts/architecture-task-plan";
import { taskPlanConfiguration } from "../../../scripts/architecture-task-plan.config";
import { validateRequiredReading } from "../../../scripts/architecture-task-reading";
import {
  canonicalScope,
  scopesOverlap,
  type ScopeAlias,
} from "../../../scripts/architecture-task-scope";

const startMarker = "<!-- architecture-status:generated:start -->";
const endMarker = "<!-- architecture-status:generated:end -->";
const taskIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const revisionPattern = /^[a-f0-9]{40}$/;
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
// prettier-ignore
const stages = new Set("architecture baseline core capabilities language specifications qualification integrations adapters applications".split(" "));
const ownerKinds = new Set(["coordinator", "codex", "claude-code"]);
const activeStatuses = new Set(taskPlanConfiguration.lifecycle.active);

// prettier-ignore
interface TaskRecord { readonly body: string; readonly evidenceMilestone: string | null; readonly fields: FrontMatterRecord; readonly forwardTo: readonly string[]; readonly id: string; readonly path: string; readonly plan: ArchitectureTask; readonly replacedBy: readonly string[]; readonly stage: string; }

// prettier-ignore
export interface ArchitectureStatusOptions { readonly aliases?: readonly ScopeAlias[]; readonly inspectCheckouts?: boolean; readonly now?: Date; readonly workspaceRoot: string; }

// prettier-ignore
export interface ArchitectureStatusResult { readonly errors: readonly string[]; readonly expectedDocument: string; readonly taskCount: number; }

const string = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

// prettier-ignore
interface ListOptions { readonly errors: string[]; readonly field: string; readonly source: string; }

// prettier-ignore
const list = (value: unknown, { source, field, errors }: ListOptions): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    errors.push(`${source}: ${field} must be a string list`); return [];
  }
  const values = value as string[];
  if (new Set(values).size !== values.length) errors.push(`${source}: ${field} has duplicates`);
  return values;
};

// prettier-ignore
const taskBody = (content: string): string => {
  const normalized = content.replaceAll("\r\n", "\n");
  const closing = normalized.indexOf("\n---\n", 4);
  const body = closing < 0 ? "" : normalized.slice(closing + 5);
  const heading = "## Work log\n", start = body.indexOf(heading);
  if (start < 0) return "";
  const contentStart = start + heading.length, end = body.indexOf("\n## ", contentStart);
  return body.slice(contentStart, end < 0 ? undefined : end);
};

// prettier-ignore
const taskFiles = async (root: string): Promise<readonly string[]> => (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
  .map((entry) => join(root, entry.name)).sort();

// prettier-ignore
const loadTasks = async (workspaceRoot: string, errors: string[]): Promise<TaskRecord[]> => {
  const root = join(workspaceRoot, "packages/llm-core/docs/final-architecture/tasks");
  const records: TaskRecord[] = [];
  for (const absolutePath of await taskFiles(root)) {
    const path = relative(workspaceRoot, absolutePath);
    const content = await readFile(absolutePath, "utf8");
    try {
      const fields = parseTaskFrontMatter(content, path, taskPlanConfiguration);
      const plan = parseArchitectureTask({ authority: "llm-core", content, path });
      records.push({
        body: taskBody(content),
        evidenceMilestone: string(fields.evidence_milestone),
        fields,
        forwardTo: list(fields.forward_to, { errors, field: "forward_to", source: path }),
        id: plan.id, path, plan,
        replacedBy: list(fields.replaced_by, { errors, field: "replaced_by", source: path }),
        stage: string(fields.stage) ?? "",
      });
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  return records;
};

// prettier-ignore
const loadDecisions = async (workspaceRoot: string): Promise<readonly ArchitectureDecision[]> => {
  const root = join(workspaceRoot, "packages/llm-core/docs/final-architecture/decisions");
  const decisions: ArchitectureDecision[] = [];
  for (const path of await taskFiles(root)) {
    const id = basename(path).match(taskPlanConfiguration.decisions.filename)?.[1];
    const status = (await readFile(path, "utf8")).match(taskPlanConfiguration.decisions.statusLine)?.[1];
    if (id !== undefined && status !== undefined) decisions.push({ authority: "llm-core", id, path, status: status.trim() });
  }
  return decisions;
};

const required = (task: TaskRecord, field: string, errors: string[]): string | null => {
  const value = string(task.fields[field]);
  if (value === null) errors.push(`${task.path}: ${field} must be a non-empty string`);
  return value;
};

// prettier-ignore
const validateVocabulary = (task: TaskRecord, errors: string[]): void => {
  const filename = basename(task.path, ".md");
  if (!taskIdPattern.test(task.id)) errors.push(`${task.path}: invalid task id ${task.id}`);
  if (task.id !== filename) errors.push(`${task.path}: id must match filename ${filename}`);
  if (task.fields.architecture_version !== 2) errors.push(`${task.path}: architecture_version must be 2`);
  if (!stages.has(task.stage)) errors.push(`${task.path}: invalid stage ${task.stage}`);
  const preferred = string(task.fields.preferred_owner_kind);
  if (preferred === null || !ownerKinds.has(preferred)) errors.push(`${task.path}: invalid preferred_owner_kind ${preferred ?? "<empty>"}`);
  const ownerKind = task.fields.owner_kind;
  const malformedOwner = ownerKind !== undefined && ownerKind !== null && ownerKind !== "" && (typeof ownerKind !== "string" || !ownerKinds.has(ownerKind));
  if (malformedOwner) errors.push(`${task.path}: invalid owner_kind ${String(ownerKind)}`);
  if (task.fields.evidence_milestone !== undefined && task.evidenceMilestone === null) errors.push(`${task.path}: evidence_milestone must be a non-empty string`);
  else if (task.evidenceMilestone?.includes("|") === true || task.evidenceMilestone?.includes("\n") === true) errors.push(`${task.path}: evidence_milestone must be Markdown-table safe`);
};

const localIds = (values: readonly string[]): readonly string[] =>
  values.map((key) => key.slice("llm-core/".length));

// prettier-ignore
const validateTaskEdges = (
  task: TaskRecord,
  byId: ReadonlyMap<string, TaskRecord>,
  errors: string[],
): boolean => {
  let invalid = false;
  for (const dependency of localIds(task.plan.dependsOn)) {
    if (dependency === task.id) errors.push(`${task.path}: depends_on contains self dependency`);
    else if (!byId.has(dependency)) errors.push(`${task.path}: missing dependency ${dependency}`);
    else continue;
    invalid = true;
  }
  for (const conflict of localIds(task.plan.conflictsWith)) {
    const target = byId.get(conflict);
    if (conflict === task.id) errors.push(`${task.path}: conflicts_with contains self conflict`);
    else if (target === undefined) errors.push(`${task.path}: unknown conflict ${conflict}`);
    else if (!localIds(target.plan.conflictsWith).includes(task.id)) errors.push(`${task.path}: asymmetric conflict ${task.id} -> ${conflict}`);
    else continue;
    invalid = true;
  }
  return invalid;
};

// prettier-ignore
interface GraphState { readonly aliases: readonly ScopeAlias[]; readonly decisions: readonly ArchitectureDecision[]; readonly errors: string[]; }

// prettier-ignore
const validateGraph = async (tasks: readonly TaskRecord[], { aliases, decisions, errors }: GraphState): Promise<void> => {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  let invalid = byId.size !== tasks.length;
  if (invalid) errors.push("task authority contains duplicate task ids");
  for (const task of tasks) invalid = validateTaskEdges(task, byId, errors) || invalid;
  if (invalid) return;
  const byDecision = new Map(decisions.map((decision) => [decision.id, decision]));
  for (const task of tasks) for (const id of task.plan.decisionDependencies) {
    const decision = byDecision.get(id);
    if (decision === undefined) errors.push(`${task.path}: missing decision ${id}`);
    else if (decision.status !== taskPlanConfiguration.decisions.acceptedStatus) errors.push(`${task.path}: decision ${id} is not accepted: ${decision.status}`);
  }
  try {
    await createArchitectureTaskPlan({ decisions, scopeAliases: aliases, tasks: tasks.map(({ plan: task }) => task) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message.includes("unresolved pipeline helpers") ? `dependency cycle: ${message}` : message);
  }
};

const git = (cwd: string, arguments_: readonly string[]): string | null => {
  const result = Bun.spawnSync(["git", ...arguments_], { cwd, stderr: "pipe", stdout: "pipe" });
  return result.exitCode === 0 ? result.stdout.toString().trim() : null;
};

// prettier-ignore
const externalTask = (
  workspaceRoot: string,
  qualifiedId: string,
): { available: boolean; committed: boolean; exists: boolean } => {
  const [authority, id, extra] = qualifiedId.split("/");
  if (authority === undefined || id === undefined || extra !== undefined || !taskIdPattern.test(id)) return { available: true, committed: false, exists: false };
  const configuration = taskPlanConfiguration.authorities[authority as "aifsd" | "llm-core"];
  if (configuration === undefined || authority === "llm-core") return { available: true, committed: false, exists: false };
  const authorityRoot = join(workspaceRoot, configuration.architectureRoot);
  if (configuration.optional && (configuration.logicalMount === null || !existsSync(join(workspaceRoot, configuration.logicalMount)))) return { available: false, committed: false, exists: false };
  const path = join(authorityRoot, "tasks", `${id}.md`);
  if (!existsSync(path) || !statSync(path).isFile()) return { available: true, committed: false, exists: false };
  const repository = git(dirname(realpathSync(path)), ["rev-parse", "--show-toplevel"]);
  if (repository === null) return { available: true, committed: false, exists: true };
  const repositoryPath = relative(repository, realpathSync(path));
  return { available: true, committed: git(repository, ["cat-file", "-t", `HEAD:${repositoryPath}`]) === "blob", exists: true };
};

// prettier-ignore
interface ReplacementState { readonly errors: string[]; readonly ids: ReadonlySet<string>; readonly workspaceRoot: string; }

const packageReferencePattern = /^[a-z0-9-]+\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const configuredForeignAuthority = (qualifiedId: string): boolean => {
  const authority = qualifiedId.split("/", 1)[0]!;
  return authority !== "llm-core" && Object.hasOwn(taskPlanConfiguration.authorities, authority);
};

// prettier-ignore
const validateReplacement = (
  task: TaskRecord,
  replacement: string,
  { errors, ids, workspaceRoot }: ReplacementState,
): void => {
  if (!replacement.includes("/")) {
    if (!ids.has(replacement)) errors.push(`${task.path}: unknown local replacement ${replacement}`);
    else if (replacement === task.id) errors.push(`${task.path}: task cannot replace itself`);
    return;
  }
  if (!packageReferencePattern.test(replacement) || !configuredForeignAuthority(replacement)) {
    errors.push(`${task.path}: malformed package-qualified replacement ${replacement}`);
    return;
  }
  const target = externalTask(workspaceRoot, replacement);
  if (!target.available) return;
  if (!target.exists) errors.push(`${task.path}: nonexistent committed replacement ${replacement}`);
  else if (!target.committed) errors.push(`${task.path}: replacement is uncommitted ${replacement}`);
};

const validateForwardTarget = (
  task: TaskRecord,
  targetId: string,
  { errors, workspaceRoot }: ReplacementState,
): void => {
  if (!packageReferencePattern.test(targetId) || !configuredForeignAuthority(targetId)) {
    errors.push(`${task.path}: malformed forward_to target ${targetId}`);
  } else if (externalTask(workspaceRoot, targetId).committed) {
    errors.push(`${task.path}: forward_to target is already committed ${targetId}`);
  }
};

// prettier-ignore
const validateReplacements = (
  workspaceRoot: string,
  tasks: readonly TaskRecord[],
  errors: string[],
): void => {
  const state = { errors, ids: new Set(tasks.map(({ id }) => id)), workspaceRoot };
  for (const task of tasks) {
    if (task.replacedBy.length > 0 && task.forwardTo.length > 0) errors.push(`${task.path}: replaced_by and forward_to are mutually exclusive`);
    for (const replacement of task.replacedBy) validateReplacement(task, replacement, state);
    for (const target of task.forwardTo) validateForwardTarget(task, target, state);
  }
};

const logValue = (body: string, label: string): string | null =>
  body.match(new RegExp(`^${label}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null;

const logValueCount = (body: string, label: string): number =>
  [...body.matchAll(new RegExp(`^${label}:`, "gm"))].length;
const containsTaskId = (value: string | null, id: string): boolean =>
  value !== null && new RegExp(`(^|[^a-z0-9-])${id}($|[^a-z0-9-])`).test(value);

// prettier-ignore
const assignmentFields = ["owner", "owner_kind", "lease_started_at", "lease_expires_at", "base_sha", "branch", "worktree"] as const;

// prettier-ignore
interface ActiveMetadata { readonly base: string | null; readonly branch: string | null; readonly leaseEnd: string | null; readonly leaseStart: string | null; readonly owner: string | null; readonly worktree: string | null; }

// prettier-ignore
interface ActiveValidationState { readonly aliases: readonly ScopeAlias[]; readonly errors: string[]; readonly inspectCheckouts: boolean; readonly now: Date; readonly workspaceRoot: string; }

const activeMetadata = (task: TaskRecord, errors: string[]): ActiveMetadata => {
  const owner = required(task, "owner", errors);
  const ownerKind = required(task, "owner_kind", errors);
  if (ownerKind !== null && !ownerKinds.has(ownerKind))
    errors.push(`${task.path}: invalid owner_kind`);
  // prettier-ignore
  return { base: required(task, "base_sha", errors), branch: required(task, "branch", errors), leaseEnd: required(task, "lease_expires_at", errors), leaseStart: required(task, "lease_started_at", errors), owner, worktree: required(task, "worktree", errors) };
};

// prettier-ignore
const validateLease = (
  task: TaskRecord,
  metadata: ActiveMetadata,
  { errors, now }: ActiveValidationState,
): void => {
  const { leaseStart, leaseEnd } = metadata;
  const start = leaseStart === null ? Number.NaN : Date.parse(leaseStart);
  const end = leaseEnd === null ? Number.NaN : Date.parse(leaseEnd);
  const invalid = leaseStart === null || leaseEnd === null || !instantPattern.test(leaseStart) || !instantPattern.test(leaseEnd) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= now.getTime();
  if (invalid) errors.push(`${task.path}: malformed or expired active lease`);
};

// prettier-ignore
const validateWorkLog = (
  task: TaskRecord,
  worktree: string | null,
  { errors, workspaceRoot }: ActiveValidationState,
): void => {
  // prettier-ignore
  const labels = ["Execution mode", "Execution rationale", "Concurrency evaluation", "Concurrent task scopes", "Swarm delegation"];
  for (const label of labels) {
    if (logValueCount(task.body, label) !== 1) errors.push(`${task.path}: active work log must contain exactly one ${label} label`);
  }
  const shared = worktree !== null && existsSync(worktree) && realpathSync(worktree) === realpathSync(workspaceRoot);
  if (logValue(task.body, "Execution mode") !== (shared ? "shared-checkout" : "dedicated-worktree")) errors.push(`${task.path}: execution mode does not match worktree`);
  if (logValue(task.body, "Execution rationale") === null) errors.push(`${task.path}: missing execution rationale`);
  const concurrency = logValue(task.body, "Concurrency evaluation");
  if (concurrency === null || !/(start alongside|wait|no concurrency)/.test(concurrency)) errors.push(`${task.path}: incomplete concurrency evaluation`);
  if (logValue(task.body, "Concurrent task scopes") === null) errors.push(`${task.path}: missing concurrent task scopes`);
  const swarm = logValue(task.body, "Swarm delegation"), lineage = swarm?.match(/^([^:;]+) -> ([^:;]+): ([^;]+); (.+)$/);
  if (swarm !== "none" && lineage?.slice(1).every((part) => part.trim() !== "") !== true) errors.push(`${task.path}: malformed swarm delegation`);
};

// prettier-ignore
const validateCheckout = (
  task: TaskRecord,
  metadata: ActiveMetadata,
  { errors, inspectCheckouts }: ActiveValidationState,
): void => {
  const { base, branch, owner, worktree } = metadata;
  if (base !== null && !revisionPattern.test(base)) errors.push(`${task.path}: invalid base_sha`);
  if (worktree !== null && !isAbsolute(worktree)) errors.push(`${task.path}: worktree must be absolute`);
  if (owner === null || branch === null || worktree === null || !inspectCheckouts) return;
  if (!existsSync(worktree)) {
    errors.push(`${task.path}: checkout does not exist ${worktree}`);
    return;
  }
  const root = git(worktree, ["rev-parse", "--show-toplevel"]);
  if (root === null || realpathSync(root) !== realpathSync(worktree)) errors.push(`${task.path}: worktree is not a checkout root`);
  if (git(worktree, ["branch", "--show-current"]) !== branch) errors.push(`${task.path}: branch does not match checkout`);
  if (base !== null && git(worktree, ["cat-file", "-e", `${base}^{commit}`]) === null) errors.push(`${task.path}: base_sha is not a commit in checkout`);
};

// prettier-ignore
const validateActiveTask = (task: TaskRecord, state: ActiveValidationState): void => {
  const metadata = activeMetadata(task, state.errors);
  validateLease(task, metadata, state); validateWorkLog(task, metadata.worktree, state); validateCheckout(task, metadata, state);
};

// prettier-ignore
const validateActivePair = (
  left: TaskRecord,
  right: TaskRecord,
  { aliases, errors }: ActiveValidationState,
): void => {
  if (localIds(left.plan.conflictsWith).includes(right.id) || localIds(right.plan.conflictsWith).includes(left.id)) errors.push(`${left.path}: active conflict with ${right.id}`);
  if (left.plan.writeScope.some((a) => right.plan.writeScope.some((b) => scopesOverlap(a, b, aliases)))) errors.push(`${left.path}: active write scope overlaps ${right.id}`);
  for (const [task, peer] of [[left, right], [right, left]] as const) {
    const evidence = [logValue(task.body, "Concurrency evaluation"), logValue(task.body, "Concurrent task scopes")];
    if (!evidence.every((value) => containsTaskId(value, peer.id))) errors.push(`${task.path}: concurrent-scope evidence omits active task ${peer.id}`);
  }
};

const validateActive = (tasks: readonly TaskRecord[], state: ActiveValidationState): void => {
  const active = tasks.filter(({ plan }) => activeStatuses.has(plan.status as never));
  for (const task of tasks) {
    const unassigned = task.plan.status === "proposed" || task.plan.status === "ready";
    const assigned = assignmentFields.some((field) => {
      const value = task.fields[field];
      return value !== undefined && value !== null && value !== "";
    });
    if (unassigned && assigned) {
      state.errors.push(`${task.path}: ${task.plan.status} task must be unassigned`);
    }
  }
  for (const task of active) validateActiveTask(task, state);
  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      validateActivePair(active[left]!, active[right]!, state);
    }
  }
};

const cell = (values: readonly string[]): string => (values.length === 0 ? "—" : values.join(", "));

// prettier-ignore
const renderArchitectureStatusRegion = (tasks: readonly TaskRecord[]): string => {
  const active = tasks.filter(({ plan }) => activeStatuses.has(plan.status as never)).length, rows = [...tasks].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)).map((task) =>
    `| ${task.id} | ${task.stage} | ${task.plan.status} | ${cell(task.plan.dependsOn.map((key) => key.slice("llm-core/".length)))} | ${task.evidenceMilestone ?? "—"} | ${cell(task.replacedBy)} | ${cell(task.forwardTo)} |`);
  // prettier-ignore
  return [startMarker, "", `Active tasks: ${active}`, "", "## Task inventory", "", "| Task | Stage | Status | Dependencies | Evidence milestone | Replaced by | Forward to |", "| --- | --- | --- | --- | --- | --- | --- |", ...rows, "", endMarker].join("\n");
};

const replaceRegion = (document: string, region: string): string => {
  const start = document.indexOf(startMarker);
  const end = document.indexOf(endMarker);
  // prettier-ignore
  if (start < 0 || end < start || document.indexOf(startMarker, start + 1) >= 0 || document.indexOf(endMarker, end + 1) >= 0) {
    throw new Error("STATUS.md must contain exactly one ordered generated marker pair");
  }
  return `${document.slice(0, start)}${region}${document.slice(end + endMarker.length)}`;
};

// prettier-ignore
const validateProjectionRows = (
  document: string,
  tasks: readonly TaskRecord[],
  errors: string[],
): void => {
  const region = document.slice(document.indexOf(startMarker), document.indexOf(endMarker));
  if (!region.includes("## Task inventory")) {
    errors.push("STATUS.md: generated region is not the canonical task inventory");
    return;
  }
  const inventory = region.slice(region.indexOf("## Task inventory"));
  // prettier-ignore
  const rows = inventory.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Task ") && !line.startsWith("| ---"));
  // prettier-ignore
  const actual = rows.map((row) => row.split("|").slice(1, -1).map((value) => value.trim()));
  const ids = actual.map(([id]) => id ?? "");
  for (const id of new Set(ids)) if (ids.filter((value) => value === id).length > 1) errors.push(`STATUS.md: duplicated task row ${id}`);
  const expected = new Map(tasks.map((task) => [task.id, task]));
  for (const id of ids) if (!expected.has(id)) errors.push(`STATUS.md: unknown or aliased task row ${id}`);
  for (const id of expected.keys()) if (!ids.includes(id)) errors.push(`STATUS.md: omitted task row ${id}`);
  for (const row of actual) {
    const task = expected.get(row[0] ?? "");
    if (task === undefined || row.length !== 7) continue;
    // prettier-ignore
    const wanted = [task.id, task.stage, task.plan.status, cell(task.plan.dependsOn.map((key) => key.slice("llm-core/".length))), task.evidenceMilestone ?? "—", cell(task.replacedBy), cell(task.forwardTo)];
    const mismatch = wanted.findIndex((value, index) => row[index] !== value);
    if (mismatch >= 0) errors.push(`STATUS.md: stale projection for ${task.id} column ${mismatch + 1}`);
  }
};

// prettier-ignore
interface ReadingValidationState { readonly aliases: readonly ScopeAlias[]; readonly errors: string[]; readonly workspaceRoot: string; }

// prettier-ignore
const validateTaskReading = (
  task: TaskRecord,
  { aliases, errors, workspaceRoot }: ReadingValidationState,
): void => {
  try {
    const reading = task.plan.requiredReading;
    for (const entry of reading) {
      const exact = task.plan.readScope.some((scope) => canonicalScope(scope, aliases) === canonicalScope(entry.path, aliases));
      if (!exact) errors.push(`${task.path}: required reading path is not declared exactly in read_scope ${entry.path}`);
    }
    // prettier-ignore
    validateRequiredReading({ configuration: taskPlanConfiguration, readScope: task.plan.readScope, reading, scopeAliases: aliases, scopesOverlap, source: task.path, status: task.plan.status, workspaceRoot });
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
};

// prettier-ignore
export const checkArchitectureStatus = async ({
  aliases = [],
  inspectCheckouts = true,
  now = new Date(),
  workspaceRoot,
}: ArchitectureStatusOptions): Promise<ArchitectureStatusResult> => {
  const errors: string[] = [];
  const tasks = await loadTasks(workspaceRoot, errors);
  const decisions = await loadDecisions(workspaceRoot);
  for (const task of tasks) validateVocabulary(task, errors);
  await validateGraph(tasks, { aliases, decisions, errors });
  validateReplacements(workspaceRoot, tasks, errors);
  for (const task of tasks) validateTaskReading(task, { aliases, errors, workspaceRoot });
  validateActive(tasks, { aliases, errors, inspectCheckouts, now, workspaceRoot });
  const statusPath = join(workspaceRoot, "packages/llm-core/docs/final-architecture/STATUS.md");
  const document = await readFile(statusPath, "utf8");
  let expectedDocument = document;
  try {
    expectedDocument = replaceRegion(document, renderArchitectureStatusRegion(tasks));
    validateProjectionRows(document, tasks, errors);
    if (document !== expectedDocument) errors.push("STATUS.md: generated region is stale");
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return { errors: [...new Set(errors)], expectedDocument, taskCount: tasks.length };
};

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// prettier-ignore
if (import.meta.main) {
  const write = process.argv.slice(2).includes("--write");
  const unknown = process.argv.slice(2).filter((argument) => argument !== "--write");
  if (unknown.length > 0) throw new Error(`unknown option ${unknown[0]}`);
  const result = await checkArchitectureStatus({ workspaceRoot });
  const nonProjectionErrors = result.errors.filter((error) => !error.startsWith("STATUS.md:"));
  if (write) {
    if (nonProjectionErrors.length > 0) { console.error(nonProjectionErrors.join("\n")); process.exit(1); }
    else {
      await writeFile(join(workspaceRoot, "packages/llm-core/docs/final-architecture/STATUS.md"), result.expectedDocument, "utf8");
      console.log(`Rendered architecture STATUS from ${result.taskCount} task briefs.`);
    }
  } else if (result.errors.length > 0) { console.error(result.errors.join("\n")); process.exit(1); }
  else console.log(`Verified architecture STATUS against ${result.taskCount} task briefs.`);
}
