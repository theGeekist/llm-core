import type { TaskResolution, TaskStatus, TaskView } from "./model";

const statusLabels: Readonly<Record<TaskStatus, string>> = {
  blocked: "Blocked",
  cancelled: "Cancelled",
  claimed: "Claimed",
  done: "Done",
  in_progress: "In progress",
  proposed: "Proposed",
  ready: "Ready",
  review: "In review",
};

export const copy = {
  actions: {
    copyContext: "Copy context",
    copied: "Copied",
    fit: "Fit",
    refresh: "Refresh",
    resolve: "Resolve",
    runContext: "Build context",
    showAll: "Show all",
    showRelated: "Focus graph",
    viewRaw: "View raw",
  },

  app: {
    avatar: "AW",
    loading: "Loading task state…",
    noTask: "No task selected.",
    title: "Architect Workbench",
    version: "v1.0.4",
  },

  commands: {
    ariaLabel: "Architecture command",

    catalogue: {
      "architecture.aifsd": {
        description: "Run all AIFSD architecture checks.",
        label: "Validate AIFSD architecture",
      },

      "architecture.diff": {
        description: "Check public and private repository changes for whitespace errors.",
        label: "Check repository diffs",
      },

      "architecture.docs": {
        description: "Check public docs, code snippets and generated status information.",
        label: "Check public docs",
      },

      "architecture.planner-tests": {
        description: "Run the task planner regression tests.",
        label: "Test task planner",
      },

      "architecture.status": {
        description: "Check the generated llm-core architecture status.",
        label: "Check architecture status",
      },

      "architecture.status.write": {
        description: "Regenerate the public architecture status.",
        label: "Regenerate architecture status",
      },

      "tasks.context": {
        description: "Build the context needed to understand and work on the selected task.",
        label: "Build task context",
      },

      "tasks.plan": {
        description: "Recalculate which tasks are ready and allowed to run.",
        label: "Replan tasks",
      },

      "workspace.status": {
        description: "Show repository changes that may affect whether tasks can run.",
        label: "Inspect current changes",
      },
    },

    failed: (error: string) => `Command failed: ${error}`,
    loadFailed: (error: string) => `Could not load commands: ${error}`,
    mutatingPrefix: "WRITE · ",
    mutatingPrompt: (label: string) => `${label} will change repository files. Run it?`,
    run: "Run",
    running: "Running…",
    runningCommand: (label: string) => `Running ${label}…`,
  },

  evidence: {
    affectedContext: "Affected context",
    compiling: "Building task context…",

    conflicts: (count: number) =>
      count === 0 ? "No task conflicts." : `${count} task conflict${count === 1 ? "" : "s"}.`,

    empty: "No command results or task context loaded.",
    owned: "Own",
    summary: (task: string) => `${task} summary`,

    tabs: {
      ci: "CI",
      decisions: "Decisions",
      git: "Git",
      reading: "Required reading",
      summary: "Summary",
    },

    validationResults: "Validation results",

    warning: (count: number) => `${count} current blocker${count === 1 ? "" : "s"}.`,
  },

  errors: {
    documentRequestFailed: (status: number) =>
      `Could not load document. Request returned ${status}.`,

    requestFailed: (status: number) => `Request failed with status ${status}.`,

    taskBriefRequestFailed: (status: number) =>
      `Could not load task brief. Request returned ${status}.`,
  },

  documents: {
    close: "Close document",
    decisions: "Decisions",
    failed: (error: string) => `Could not load document: ${error}`,
    loading: "Loading document…",
    openInObsidian: "Open in Obsidian",
    preview: "Preview",
    previewTask: "Preview task",
  },

  graph: {
    detached: (count: number) =>
      `${count} task${count === 1 ? "" : "s"} outside the dependency tree`,

    directionOutcomes: "↓ Dependants and outcomes",
    directionRoots: "↑ Roots and prerequisites",
    fit: "Fit graph",

    hint: "",

    loadingDetail: "Laying out dependencies and preparing the selected task.",
    loadingTitle: "Building task graph",
    lineage: "Lineage",
    outcome: "Outcome",
    root: "Root",
    showEntireGraph: "Show entire graph",
    toggleLineage: "Highlight lineage",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
  },

  inspector: {
    blockers: "Blockers",
    close: "Close task context",
    dependencies: "Dependencies",
    inspectChanges: "Inspect changes",
    inspectDependency: "Inspect dependency",
    moreActions: "More actions",
    noBlockers: "No blockers",
    priority: "Priority",
    stage: "Stage",
    status: "Status",
  },

  messages: {
    contextFailed: (error: string) => `Could not build task context: ${error}`,

    inspectingChanges: "Inspecting current repository changes…",

    workspaceInspectionFailed: (error: string) => `Could not inspect workspace: ${error}`,
  },

  queue: {
    archive: "Archive",
    empty: "No tasks in this view.",
    history: "History",
    newTask: "+ New task",
    subtitle: "Task queue",

    tabs: {
      active: "Active",
      blocked: "Blocked",
      done: "Done",
      ready: "Ready",
    },

    title: "Tasks",
  },

  common: {
    none: "None",
  },

  remediation: {
    affectedPaths: "Affected paths",
    after: "After",
    before: "Before",
    boundPreview: "Exact operation preview",
    buildPreview: "Building preview…",
    changeConfiguration: "Change settings",

    checkpointDescription: "Commit the selected changes, then check whether the task can run.",

    checkpointQueueItem: "☑ Commit selected changes",
    checkpointTitle: "Commit selected changes",
    close: "Close",

    commitAndValidate: "Commit and recheck",
    commitMessage: "Commit message",
    copyReceipt: "Copy receipt",
    currentHead: "Current HEAD",

    defaultMessage: (task: string) => `chore: checkpoint work blocking ${task}`,

    effect: "Result",

    exactPaths: "Selected paths",

    exitCode: (code: number) => `Exit ${code}`,

    executing: "Applying changes and checking result…",

    executionDetails:
      "Applying the Git operation, validating the result and recalculating task readiness.",

    executionReceipt: "Operation receipt",
    executionRejected: "Operation rejected",
    executingOperation: "Running operation",

    expires: (time: string) => `Expires ${time}`,

    gitOperation: "Git operation",
    operation: "Operation",
    operationsQueue: "Pending operations",

    overlap: (task: string) => `${task} needs files that already contain uncommitted changes.`,

    plannerRerun: (value: string) => `Planner rerun: ${value}`,

    previewOperation: "Preview exact changes",
    receipt: "Receipt",
    receiptAdmitted: "Task is now ready",
    returnToTask: "Return to task",
    runningSource: "Running source",

    safelyStash: "Stash selected changes",
    stashAndValidate: "Stash and recheck",

    stashDescription:
      "Create a recoverable stash for the selected paths, then check whether the task can run.",

    stashDisabled:
      "Unavailable because these changes include code currently running this workbench.",

    stashLabel: "Stash name",
    stashQueueItem: "⊘ Stash selected changes",
    statusDigest: "Workspace state",

    stages: {
      configure: "Configure",
      execute: "Apply",
      explain: "Problem",
      preview: "Preview",
      receipt: "Result",
    },

    structured: "Resolve safely",
    title: "Resolve workspace conflict",
    validation: "Validation",
    whatIsWrong: "What needs attention",
  },

  splitters: {
    context: "Resize task context",
    evidence: "Resize evidence pane",
    tasks: "Resize task list",
  },

  taskBrief: {
    acceptance: "Acceptance criteria",
    failed: "Could not load task brief",
    loading: "Loading task brief…",
    objective: "Objective",
    outOfScope: "Out of scope",
    scope: "In scope",
    unavailable: "No task brief available.",
    verification: "Verification",
    why: "Why this exists",
    workLog: "Work log",
  },

  taskAuthoring: {
    authority: "Authority",
    cancel: "Cancel",
    close: "Close task creation",
    create: "Create task",
    creating: "Creating and validating…",
    dependsOn: "Dependencies",

    dependsOnPlaceholder: "authority/task-id, another-task-id",

    description: "Create and validate a task draft, then refine it in Obsidian.",

    objective: "Objective",
    priority: "Priority",
    stage: "Stage",
    taskId: "Task ID",
    taskTitle: "Title",
    title: "New architecture task",
    why: "Why this exists",
  },

  toolbar: {
    refresh: "Refresh task state",
    search: "Search tasks, files and commands",
    searchPlaceholder: "Search tasks, files, commands…",
    settings: "Workbench settings",
    toggleContext: "Toggle task context",
    toggleContextHint: "Toggle right sidebar (Cmd+Option+B)",
    toggleTasks: "Toggle task pane",
    toggleTasksHint: "Toggle left sidebar (Cmd+B)",
  },

  views: {
    active: "Active",
    done: "Done",
    "needs-action": "Needs action",
    ready: "Ready",
    waiting: "Waiting",
  },
} as const;

export const taskStateLabel = (view: TaskView, status: TaskStatus): string =>
  view === "needs-action" || view === "waiting" || view === "ready"
    ? copy.views[view]
    : statusLabels[status];

export interface ResolutionText {
  readonly detail: string;
  readonly next: string;
  readonly title: string;
}

export const resolutionText = (resolution: TaskResolution): ResolutionText => {
  switch (resolution.code) {
    case "dependency-wait": {
      const task = resolution.relatedTask ?? "The required task";

      const status = resolution.relatedTaskStatus?.replaceAll("_", " ") ?? "not complete";

      return {
        detail: `${task} is currently ${status}, so this task cannot start yet.`,
        next: "Inspect the dependency and finish, replace or correct it.",
        title: "Waiting for a dependency",
      };
    }

    case "workspace-overlap":
      return {
        detail: `${resolution.path ?? "A required path"} already has uncommitted changes that overlap this task.`,
        next: "Commit, stash or separate the existing changes, then refresh the plan.",
        title: "Workspace changes overlap this task",
      };

    case "priority-wait": {
      const priority = resolution.priority ?? "higher-priority";

      return {
        detail: `${priority} work is currently ahead of this task.`,
        next: `Finish or reprioritise the ${priority} work, then refresh the plan.`,
        title: `Waiting behind ${priority} work`,
      };
    }

    case "coordination-gate":
      return {
        detail: resolution.reason ?? "Another task is already working on the same area.",

        next: "Inspect the conflicting task, then finish it, release it or separate the work.",

        title: "Another task owns overlapping work",
      };

    case "governance-gate":
      return {
        detail: resolution.reason ?? "This task does not currently satisfy its governing rules.",

        next: "Inspect the task and relevant decision, correct the task metadata, then validate again.",

        title: "Task details need attention",
      };

    case "frontier-wait":
      return {
        detail: "This task is valid, but it is not ready to run yet.",

        next: "Refresh after the current work moves forward.",

        title: "Waiting for its turn",
      };

    default:
      return {
        detail: "This task cannot start in its current state.",

        next: "Inspect the task context, fix the cause and refresh the plan.",

        title: "Task needs attention",
      };
  }
};
