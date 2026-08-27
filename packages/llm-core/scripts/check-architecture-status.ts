import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalScope,
  createArchitectureTaskPlan,
  parseArchitectureTask,
  parseTaskFrontMatter,
  scopesOverlap,
  type ArchitectureDecision,
  type ArchitectureTask,
  type FrontMatterRecord,
  type ScopeAlias,
} from "@geekist/task-graph";
import { loadTaskGraphRuntime, validateRequiredReading } from "@geekist/task-graph/node";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const taskPlanConfiguration = loadTaskGraphRuntime(
  resolve(repositoryRoot, "task-graph.project.json"),
  repositoryRoot,
).configuration;

const startMarker = "<!-- architecture-status:generated:start -->";
const endMarker = "<!-- architecture-status:generated:end -->";
const taskIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// prettier-ignore
const stages = new Set("architecture baseline core capabilities language specifications qualification integrations adapters applications".split(" "));
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
        replacedBy: [],
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

// prettier-ignore
const validateVocabulary = (task: TaskRecord, errors: string[]): void => {
  const filename = basename(task.path, ".md");
  if (!taskIdPattern.test(task.id)) errors.push(`${task.path}: invalid task id ${task.id}`);
  if (task.id !== filename) errors.push(`${task.path}: id must match filename ${filename}`);
  if (!stages.has(task.stage)) errors.push(`${task.path}: invalid stage ${task.stage}`);
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
    else if (byId.has(dependency)) continue;
    else errors.push(`${task.path}: missing dependency ${dependency}`);
    invalid = true;
  }
  for (const conflict of localIds(task.plan.conflictsWith)) {
    const target = byId.get(conflict);
    if (conflict === task.id) errors.push(`${task.path}: conflicts_with contains self conflict`);
    else if (target === undefined) errors.push(`${task.path}: unknown conflict ${conflict}`);
    else if (localIds(target.plan.conflictsWith).includes(task.id)) continue;
    else errors.push(`${task.path}: asymmetric conflict ${task.id} -> ${conflict}`);
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

// prettier-ignore
interface ReplacementState { readonly errors: string[]; readonly ids: ReadonlySet<string>; }

const packageReferencePattern = /^[a-z0-9-]+\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const configuredForeignAuthority = (qualifiedId: string): boolean => {
  const authority = qualifiedId.split("/", 1)[0]!;
  return authority !== "llm-core" && Object.hasOwn(taskPlanConfiguration.authorities, authority);
};

const validateForwardTarget = (
  task: TaskRecord,
  targetId: string,
  { errors, ids }: ReplacementState,
): void => {
  if (!targetId.includes("/")) {
    if (!ids.has(targetId))
      errors.push(`${task.path}: unknown local forward_to target ${targetId}`);
    else if (targetId === task.id) errors.push(`${task.path}: task cannot forward to itself`);
  } else if (!packageReferencePattern.test(targetId) || !configuredForeignAuthority(targetId)) {
    errors.push(`${task.path}: malformed forward_to target ${targetId}`);
  }
};

// prettier-ignore
const validateReplacements = (
  tasks: readonly TaskRecord[],
  errors: string[],
): void => {
  const state = { errors, ids: new Set(tasks.map(({ id }) => id)) };
  for (const task of tasks) {
    for (const target of task.forwardTo) validateForwardTarget(task, target, state);
  }
};

const cell = (values: readonly string[]): string => (values.length === 0 ? "—" : values.join(", "));

// prettier-ignore
const renderArchitectureStatusRegion = (tasks: readonly TaskRecord[]): string => {
  const active = tasks.filter(({ plan }) => activeStatuses.has(plan.status as never)).length, rows = [...tasks].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)).map((task) =>
    `| ${task.id} | ${task.stage} | ${task.plan.status} | ${cell(task.plan.dependsOn.map((key) => key.slice("llm-core/".length)))} | ${task.evidenceMilestone ?? "—"} | ${cell(task.replacedBy)} | ${cell(task.forwardTo)} |`);
  // prettier-ignore
  return [startMarker, "", `Active tasks: ${active}`, "", "## Task inventory", "", "<!-- prettier-ignore -->", "| Task | Stage | Status | Dependencies | Evidence milestone | Replaced by | Forward to |", "| --- | --- | --- | --- | --- | --- | --- |", ...rows, "", endMarker].join("\n");
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
  workspaceRoot,
}: ArchitectureStatusOptions): Promise<ArchitectureStatusResult> => {
  const errors: string[] = [];
  const tasks = await loadTasks(workspaceRoot, errors);
  const decisions = await loadDecisions(workspaceRoot);
  for (const task of tasks) validateVocabulary(task, errors);
  await validateGraph(tasks, { aliases, decisions, errors });
  validateReplacements(tasks, errors);
  for (const task of tasks) validateTaskReading(task, { aliases, errors, workspaceRoot });
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
