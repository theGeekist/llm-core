import type { WorkflowExecutionPlan } from "@geekist/llm-core";

declare const portableIntent: WorkflowExecutionPlan;
declare const langGraphTarget: {
  compile(plan: WorkflowExecutionPlan): Promise<unknown>;
};

const nativeGraph = await langGraphTarget.compile(portableIntent);

console.log(nativeGraph);
