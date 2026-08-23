import type { RuntimeNeutralProjectView } from "../../project-semantics/public.js";

export interface HeadlessWorkbenchStatusProjection {
  readonly markdown: string;
  readonly mermaid: string;
}

const lifecycleByTask = (view: RuntimeNeutralProjectView): ReadonlyMap<string, string> =>
  new Map(
    view.assertions
      .filter(({ assertion }) => assertion.retractedBy === null)
      .filter(({ assertion }) => assertion.predicate === "task.lifecycle")
      .flatMap(({ assertion }) =>
        typeof assertion.object === "string"
          ? [[assertion.subjectId, assertion.object] as const]
          : [],
      ),
  );

const statusProjectionVerification = (view: RuntimeNeutralProjectView): string => {
  const assertions = view.assertions
    .filter(
      ({ assertion: value }) =>
        value.retractedBy === null && value.predicate === "project.status-projection",
    )
    .map(({ assertion }) => assertion.object)
    .flatMap((value) => {
      if (value === null || typeof value !== "object") return [];
      const record = value as {
        readonly matchesTaskLifecycle?: unknown;
        readonly mismatches?: unknown;
        readonly path?: unknown;
      };
      return [
        {
          matches: record.matchesTaskLifecycle === true,
          mismatches: Array.isArray(record.mismatches)
            ? record.mismatches.filter(
                (mismatch): mismatch is string => typeof mismatch === "string",
              )
            : [],
          path: typeof record.path === "string" ? record.path : "unknown source",
        },
      ];
    });
  if (assertions.length === 0) return "not recorded";
  const divergent = assertions.filter(({ matches }) => !matches);
  if (divergent.length === 0) return "verified";
  const sources = divergent.map(({ mismatches, path }) =>
    mismatches.length === 0 ? path : `${path}: ${mismatches.join(", ")}`,
  );
  return `divergent (${sources.join("; ")})`;
};

const displayTaskId = (taskId: string): string => taskId.replace(/^task:/, "");

const mermaidNodeId = (taskId: string): string =>
  `task_${[...taskId].map((character) => character.codePointAt(0)!.toString(16)).join("_")}`;

const mermaidLabel = (value: string): string => value.replaceAll('"', "'");

export const renderHeadlessWorkbenchStatus = (
  view: RuntimeNeutralProjectView,
): HeadlessWorkbenchStatusProjection => {
  const tasks = [...view.tasks].sort((left, right) => left.taskId.localeCompare(right.taskId));
  const lifecycles = lifecycleByTask(view);
  const markdown = [
    "# AIFSD Headless Workbench Status",
    "",
    `Project: \`${view.projectId}\``,
    `Checkpoint: ${view.journalCheckpoint.position}`,
    `Projection: \`${view.projectionDigest.value}\``,
    `Native STATUS.md: ${statusProjectionVerification(view)}`,
    "",
    "| Task | Native lifecycle | Readiness | Completion | Blockers |",
    "| --- | --- | --- | --- | --- |",
    ...tasks.map(
      (task) =>
        `| ${displayTaskId(task.taskId)} | ${lifecycles.get(task.taskId) ?? "unknown"} | ${task.readiness} | ${task.completion} | ${task.blockers.join("; ") || "none"} |`,
    ),
  ].join("\n");
  const mermaid = [
    "flowchart TD",
    ...tasks.map(
      (task) =>
        `  ${mermaidNodeId(task.taskId)}["${mermaidLabel(displayTaskId(task.taskId))}\\n${lifecycles.get(task.taskId) ?? "unknown"} / ${task.readiness}"]`,
    ),
    ...tasks.flatMap((task) =>
      task.dependencies.map(
        (dependency) => `  ${mermaidNodeId(dependency)} --> ${mermaidNodeId(task.taskId)}`,
      ),
    ),
  ].join("\n");
  return { markdown, mermaid };
};
