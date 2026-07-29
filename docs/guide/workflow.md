# Resume a workflow

The P0 workflow surface coordinates an authenticated intervention against a
registered checkpoint. It does not revive an arbitrary snapshot.

```ts
import {
  resumeInterventionWorkflow,
  type ResumeInterventionWorkflowInput,
} from "@geekist/llm-core/workflow";

async function resume(input: ResumeInterventionWorkflowInput) {
  const outcome = await resumeInterventionWorkflow(input);

  if (outcome.status === "reconciliation-required") {
    await reconciliationQueue.enqueue({
      stepId: outcome.stepId,
      effectStatus: outcome.effectStatus,
    });
  }

  return outcome;
}
```

A real `ResumeInterventionWorkflowInput` supplies:

1. a `RegisteredResumableCheckpoint`, its matching intervention and an
   authenticated decision;
2. expected runtime, schema, code, checkpoint-format and native-reference
   compatibility;
3. an action-digest verifier, authentication port, clock and authoritative
   resume journal;
4. the exact ordered steps for this workflow version.

The journal atomically consumes a decision and claims a checkpoint. Before a
meaningful resumed step runs, it records `started`; completion then records the
effect and state. A recorded `started` or `indeterminate` effect is reconciled,
never blindly replayed. `deferred`, `edit-requires-new-binding` and `escalated`
resolve the intervention without pretending the checkpoint was resumed.
