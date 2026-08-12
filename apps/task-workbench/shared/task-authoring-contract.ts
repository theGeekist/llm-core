export interface CreateTaskInput {
  readonly authority: "aifsd" | "llm-core";
  readonly dependsOn: readonly string[];
  readonly id: string;
  readonly objective: string;
  readonly priority: "critical" | "high" | "medium" | "normal";
  readonly stage: string;
  readonly title: string;
  readonly why: string;
}

export interface CreateTaskResult<Plan> {
  readonly plan: Plan;
  readonly taskKey: string;
}
