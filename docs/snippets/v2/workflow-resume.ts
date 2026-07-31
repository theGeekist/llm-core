import {
  resumeInterventionWorkflow,
  type ResumeInterventionWorkflowInput,
} from "@geekist/llm-core/workflow/runtime";

declare const input: ResumeInterventionWorkflowInput;
declare const reconciliationQueue: {
  enqueue(value: { stepId: string; effectStatus: "started" | "indeterminate" }): Promise<void>;
};

const outcome = await resumeInterventionWorkflow(input);

if (outcome.status === "reconciliation-required") {
  await reconciliationQueue.enqueue({
    stepId: outcome.stepId,
    effectStatus: outcome.effectStatus,
  });
}
