export type WorkspaceRemediationId = "workspace.checkpoint" | "workspace.stash";

export interface WorkspacePathState {
  readonly indexStatus: string;
  readonly path: string;
  readonly runtimeCritical: boolean;
  readonly worktreeStatus: string;
}

export interface WorkspaceRemediationInput {
  readonly actionId: WorkspaceRemediationId;
  readonly message?: string;
  readonly paths: readonly string[];
  readonly task: string;
}

export interface WorkspaceRemediationPreview {
  readonly actionId: WorkspaceRemediationId;
  readonly availablePaths: readonly WorkspacePathState[];
  readonly command: readonly string[];
  readonly effect: string;
  readonly executable: boolean;
  readonly expiresAt: string;
  readonly head: string;
  readonly paths: readonly string[];
  readonly statusDigest: string;
  readonly task: string;
  readonly token: string;
  readonly validation: readonly string[];
  readonly warnings: readonly string[];
}

export interface RemediationReceipt {
  readonly actionId: WorkspaceRemediationId;
  readonly affectedPaths: readonly string[];
  readonly after: {
    readonly head: string;
    readonly statusDigest: string;
  };
  readonly before: {
    readonly head: string;
    readonly statusDigest: string;
  };
  readonly completedAt: string;
  readonly id: string;
  readonly operationIdentity: string;
  readonly plannerRerun: "complete" | "failed";
  readonly startedAt: string;
  readonly validation: readonly {
    readonly command: string;
    readonly exitCode: number;
    readonly output: string;
  }[];
}

export interface RemediationExecutionResult<Plan = unknown> {
  readonly plan: Plan | null;
  readonly receipt: RemediationReceipt;
}
