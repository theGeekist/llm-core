import type { TaskResolution, TaskView, WorkbenchTask } from "./model";

const activeStatuses = new Set(["claimed", "in_progress", "review"]);
const doneStatuses = new Set(["done", "cancelled"]);
const dependencyPattern = /^dependency status ([a-z0-9-]+\/[a-z0-9-]+): (.+)$/;
const dirtyPathPattern = /^write scope contains dirty path (.+)$/;

const taskBlockers = (task: WorkbenchTask): readonly string[] => [
  ...task.blockers,
  ...task.safetyBlockers,
];

export const taskView = (task: WorkbenchTask): TaskView => {
  if (doneStatuses.has(task.status)) return "done";
  if (activeStatuses.has(task.status)) return "active";
  if (task.canStart) return "ready";
  const blockers = taskBlockers(task);
  if (
    blockers.some(
      (blocker) =>
        blocker.startsWith("deferred while priority is ") || dependencyPattern.test(blocker),
    )
  ) {
    return "waiting";
  }
  return blockers.length > 0 || task.status === "blocked" ? "needs-action" : "waiting";
};

const blockerResolution = (blocker: string): TaskResolution => {
  const dependency = dependencyPattern.exec(blocker);
  if (dependency !== null) {
    const [, relatedTask, status] = dependency;
    return {
      code: "dependency-wait",
      kind: "dependency",
      relatedTask,
      relatedTaskStatus: status,
    };
  }
  const dirtyPath = dirtyPathPattern.exec(blocker);
  if (dirtyPath !== null) {
    const [, path] = dirtyPath;
    return {
      code: "workspace-overlap",
      kind: "workspace",
      path,
    };
  }
  if (blocker.startsWith("deferred while priority is ")) {
    const priority = blocker.slice("deferred while priority is ".length);
    return {
      code: "priority-wait",
      kind: "priority",
      priority,
    };
  }
  if (/active task|conflict|lease|owner/i.test(blocker)) {
    return {
      code: "coordination-gate",
      kind: "coordination",
      reason: blocker,
    };
  }
  return {
    code: "governance-gate",
    kind: "governance",
    reason: blocker,
  };
};

export const taskResolutions = (task: WorkbenchTask): readonly TaskResolution[] => {
  const blockers = taskBlockers(task);
  if (blockers.length > 0) return blockers.map(blockerResolution);
  if (taskView(task) === "waiting") {
    return [
      {
        code: "frontier-wait",
        kind: "priority",
      },
    ];
  }
  return [];
};

export const taskViewCounts = (
  tasks: readonly WorkbenchTask[],
): Readonly<Record<TaskView, number>> => {
  const counts: Record<TaskView, number> = {
    ready: 0,
    "needs-action": 0,
    waiting: 0,
    active: 0,
    done: 0,
  };
  for (const task of tasks) counts[taskView(task)] += 1;
  return counts;
};
