import type { WorkflowExecutionPlan } from "@aifsd/llm-core";

declare const portableIntent: WorkflowExecutionPlan;
declare const langGraphTarget: {
  compile(plan: WorkflowExecutionPlan): Promise<unknown>;
};

const nativeGraph = await langGraphTarget.compile(portableIntent);

console.log(nativeGraph);
