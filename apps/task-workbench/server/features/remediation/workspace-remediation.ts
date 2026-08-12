import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type {
  RemediationExecutionResult,
  RemediationReceipt,
  WorkspacePathState,
  WorkspaceRemediationInput,
  WorkspaceRemediationPreview,
} from "../../../shared/remediation-contract";

const workspaceRoot = resolve(import.meta.dirname, "../../../../..");
const taskKeyPattern = /^[a-z0-9-]+\/[a-z0-9-]+$/;
const previewLifetimeMs = 5 * 60 * 1000;
const previews = new Map<
  string,
  {
    readonly expiresAt: number;
    readonly input: WorkspaceRemediationInput;
    readonly snapshot: Snapshot;
  }
>();

interface GitResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

interface Snapshot {
  readonly head: string;
  readonly paths: readonly WorkspacePathState[];
  readonly statusDigest: string;
}

const runGit = (...arguments_: string[]): GitResult => {
  const result = Bun.spawnSync(["git", ...arguments_], {
    cwd: workspaceRoot,
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString().trim(),
    stdout: result.stdout.toString().trim(),
  };
};

const successfulGit = (...arguments_: string[]): string => {
  const result = runGit(...arguments_);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${arguments_[0]} failed`);
  }
  return result.stdout;
};

const rawGit = (...arguments_: string[]): string => {
  const result = Bun.spawnSync(["git", ...arguments_], {
    cwd: workspaceRoot,
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString().trim() || `git ${arguments_[0]} failed`);
  }
  return result.stdout.toString();
};

export const runtimeCritical = (path: string): boolean =>
  path === "apps/task-workbench" || path.startsWith("apps/task-workbench/");

export const parseStatus = (status: string): readonly WorkspacePathState[] => {
  const records = status.split("\0");
  const paths: WorkspacePathState[] = [];
  let consumeRenameSource = false;
  for (const record of records) {
    if (consumeRenameSource) {
      consumeRenameSource = false;
      continue;
    }
    if (record === undefined || record === "") continue;
    const indexStatus = record[0] ?? " ";
    const worktreeStatus = record[1] ?? " ";
    const path = record.slice(3);
    consumeRenameSource = indexStatus === "R" || indexStatus === "C";
    paths.push({ indexStatus, path, runtimeCritical: runtimeCritical(path), worktreeStatus });
  }
  return paths.sort((left, right) => left.path.localeCompare(right.path));
};

const snapshot = (): Snapshot => {
  const head = successfulGit("rev-parse", "HEAD");
  const status = rawGit("status", "--porcelain=v1", "-z", "--untracked-files=all");
  return {
    head,
    paths: parseStatus(status),
    statusDigest: createHash("sha256").update(head).update("\0").update(status).digest("hex"),
  };
};

const normaliseInput = (input: WorkspaceRemediationInput): WorkspaceRemediationInput => {
  if (input.actionId !== "workspace.checkpoint" && input.actionId !== "workspace.stash") {
    throw new Error("Unknown remediation action");
  }
  if (!taskKeyPattern.test(input.task)) throw new Error("A valid selected task is required");
  const paths = [...new Set(input.paths)];
  if (paths.length === 0 || paths.length > 200) throw new Error("Select between 1 and 200 paths");
  const message = input.message?.trim();
  if (input.actionId === "workspace.checkpoint" && (message === undefined || message === "")) {
    throw new Error("Checkpoint message is required");
  }
  if (message !== undefined && (message.length > 120 || /[\r\n]/u.test(message))) {
    throw new Error("Message must be one line and at most 120 characters");
  }
  return { actionId: input.actionId, message, paths, task: input.task };
};

const previewWarnings = (input: WorkspaceRemediationInput, state: Snapshot): readonly string[] => {
  const available = new Set(state.paths.map(({ path }) => path));
  const warnings: string[] = [];
  const missing = input.paths.filter((path) => !available.has(path));
  if (missing.length > 0) warnings.push(`No longer dirty: ${missing.join(", ")}`);
  const staged = state.paths.filter(
    ({ indexStatus }) => indexStatus !== " " && indexStatus !== "?",
  );
  if (staged.length > 0) {
    warnings.push(
      "The Git index already contains staged changes. Checkpointing is disabled until they are resolved.",
    );
  }
  if (
    input.actionId === "workspace.stash" &&
    state.paths.some(
      ({ path, runtimeCritical: critical }) => critical && input.paths.includes(path),
    )
  ) {
    warnings.push("Workbench source is selected. Stashing it would terminate this active session.");
  }
  return warnings;
};

const previewCommand = (input: WorkspaceRemediationInput): readonly string[] =>
  input.actionId === "workspace.checkpoint"
    ? [
        `git add -- ${input.paths.map((path) => JSON.stringify(path)).join(" ")}`,
        `git commit -m ${JSON.stringify(input.message ?? "")}`,
      ]
    : [
        `git stash push --include-untracked -m ${JSON.stringify(input.message ?? "Architect Workbench")} -- ${input.paths.map((path) => JSON.stringify(path)).join(" ")}`,
      ];

export const previewWorkspaceRemediation = (
  rawInput: WorkspaceRemediationInput,
): WorkspaceRemediationPreview => {
  const input = normaliseInput(rawInput);
  const state = snapshot();
  const warnings = previewWarnings(input, state);
  const token = randomUUID();
  const expiresAt = Date.now() + previewLifetimeMs;
  previews.set(token, { expiresAt, input, snapshot: state });
  return {
    actionId: input.actionId,
    availablePaths: state.paths,
    command: previewCommand(input),
    effect:
      "Recomputes task admission after the selected dirty paths are removed from the worktree.",
    executable: warnings.length === 0,
    expiresAt: new Date(expiresAt).toISOString(),
    head: state.head,
    paths: input.paths,
    statusDigest: state.statusDigest,
    task: input.task,
    token,
    validation: ["git diff --cached --check", "bun run tasks:plan --authority all"],
    warnings,
  };
};

const validationRecord = (command: string, result: GitResult) => ({
  command,
  exitCode: result.exitCode,
  output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
});

const executeCheckpoint = (input: WorkspaceRemediationInput) => {
  const add = runGit("add", "--", ...input.paths);
  if (add.exitCode !== 0)
    throw new Error(add.stderr || add.stdout || "Could not stage selected paths");
  const diff = runGit("diff", "--cached", "--check");
  if (diff.exitCode !== 0) {
    runGit("restore", "--staged", "--", ...input.paths);
    throw new Error(diff.stderr || diff.stdout || "Staged diff validation failed");
  }
  const commit = runGit("commit", "-m", input.message ?? "Architect Workbench checkpoint");
  if (commit.exitCode !== 0) {
    runGit("restore", "--staged", "--", ...input.paths);
    throw new Error(commit.stderr || commit.stdout || "Checkpoint commit failed");
  }
  return [
    validationRecord("git diff --cached --check", diff),
    validationRecord("git commit", commit),
  ];
};

const executeStash = (input: WorkspaceRemediationInput) => {
  const stash = runGit(
    "stash",
    "push",
    "--include-untracked",
    "-m",
    input.message ?? `Architect Workbench: ${input.task}`,
    "--",
    ...input.paths,
  );
  if (stash.exitCode !== 0) throw new Error(stash.stderr || stash.stdout || "Stash failed");
  return [validationRecord("git stash push", stash)];
};

export const executeWorkspaceRemediation = <Plan>(
  token: string,
  replan: () => Plan,
): RemediationExecutionResult<Plan> => {
  const admitted = previews.get(token);
  previews.delete(token);
  if (admitted === undefined || admitted.expiresAt < Date.now()) {
    throw new Error("Preview is missing or expired. Preview the operation again.");
  }
  const before = snapshot();
  if (
    before.head !== admitted.snapshot.head ||
    before.statusDigest !== admitted.snapshot.statusDigest
  ) {
    throw new Error("Workspace changed after preview. Preview the operation again.");
  }
  const warnings = previewWarnings(admitted.input, before);
  if (warnings.length > 0) throw new Error(warnings.join(" "));
  const startedAt = new Date().toISOString();
  const validation =
    admitted.input.actionId === "workspace.checkpoint"
      ? executeCheckpoint(admitted.input)
      : executeStash(admitted.input);
  let plan: Plan | null = null;
  let plannerRerun: "complete" | "failed" = "complete";
  let plannerOutput = "Planner rerun complete";
  try {
    plan = replan();
  } catch (error) {
    plannerRerun = "failed";
    plannerOutput = error instanceof Error ? error.message : String(error);
  }
  const after = snapshot();
  const receipt: RemediationReceipt = {
    actionId: admitted.input.actionId,
    affectedPaths: admitted.input.paths,
    after: { head: after.head, statusDigest: after.statusDigest },
    before: { head: before.head, statusDigest: before.statusDigest },
    completedAt: new Date().toISOString(),
    id: randomUUID(),
    operationIdentity:
      admitted.input.actionId === "workspace.checkpoint"
        ? after.head
        : successfulGit("rev-parse", "refs/stash"),
    plannerRerun,
    startedAt,
    validation: [
      ...validation,
      {
        command: "bun run tasks:plan --authority all",
        exitCode: plannerRerun === "complete" ? 0 : 1,
        output: plannerOutput,
      },
    ],
  };
  return { plan, receipt };
};
