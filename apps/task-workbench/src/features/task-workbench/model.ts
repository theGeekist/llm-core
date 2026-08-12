export type TaskStatus =
  | "proposed"
  | "ready"
  | "claimed"
  | "in_progress"
  | "review"
  | "blocked"
  | "done"
  | "cancelled";

export interface RequiredReading {
  readonly document?: WorkbenchDocument;
  readonly path: string;
  readonly reason: string;
  readonly ref: string | null;
}

export interface WorkbenchDocument {
  readonly browserUrl: string;
  readonly id: string;
  readonly kind: "architecture" | "decision" | "task";
  readonly label: string;
  readonly obsidianUrl: string;
  readonly path: string;
}

export interface WorkbenchTask {
  readonly authority: string;
  readonly blockers: readonly string[];
  readonly canStart: boolean;
  readonly conflictsWith: readonly string[];
  readonly decisionDependencies: readonly string[];
  readonly decisions: readonly WorkbenchDocument[];
  readonly dependsOn: readonly string[];
  readonly document: WorkbenchDocument;
  readonly key: string;
  readonly path: string;
  readonly priority: string;
  readonly priorityDefaulted: boolean;
  readonly readScope: readonly string[];
  readonly requiredReading: readonly RequiredReading[];
  readonly safetyBlockers: readonly string[];
  readonly stage: string;
  readonly status: TaskStatus;
  readonly title: string;
  readonly writeScope: readonly string[];
}

export interface TaskBrief {
  readonly acceptanceCriteria: readonly string[];
  readonly blocker: string;
  readonly handoff: string;
  readonly inScope: readonly string[];
  readonly objective: string;
  readonly outOfScope: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly verification: readonly string[];
  readonly why: string;
  readonly workLog: string;
}

export interface WorkbenchPlan {
  readonly diagnostics: readonly string[];
  readonly priority: string | null;
  readonly tasks: readonly WorkbenchTask[];
  readonly workspace: {
    readonly branch: string;
    readonly dirty: boolean;
    readonly revision: string;
    readonly root: string;
  };
}

export type TaskView = "ready" | "needs-action" | "waiting" | "active" | "done";

export interface TaskResolution {
  readonly code:
    | "coordination-gate"
    | "dependency-wait"
    | "frontier-wait"
    | "governance-gate"
    | "priority-wait"
    | "workspace-overlap";
  readonly kind: "dependency" | "priority" | "workspace" | "coordination" | "governance";
  readonly path?: string;
  readonly priority?: string;
  readonly reason?: string;
  readonly relatedTask?: string;
  readonly relatedTaskStatus?: string;
}

export interface GraphNode {
  readonly task: WorkbenchTask;
  readonly x: number;
  readonly y: number;
}

export interface WorkbenchCommand {
  readonly description: string;
  readonly id: string;
  readonly label: string;
  readonly mutates: boolean;
  readonly requiresTask: boolean;
}
