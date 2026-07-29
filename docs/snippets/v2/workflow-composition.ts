import {
  composeWorkflow,
  defineWorkflow,
  runWorkflow,
  type WorkflowExecutionOutcome,
} from "@geekist/llm-core/workflow";

type State = {
  readonly draft: string;
  readonly checked: boolean;
};

type Pause = {
  readonly reason: "review";
};

const draft = defineWorkflow<State, Pause>({
  workflowId: "example.draft",
  version: "2.0.0",
  steps: [
    {
      key: "draft",
      effect: "none",
      execute: ({ state }) => ({
        status: "continue",
        state: { ...state, draft: "A portable result." },
      }),
    },
  ],
});

const review = defineWorkflow<State, Pause>({
  workflowId: "example.review",
  version: "2.0.0",
  steps: [
    {
      key: "review",
      effect: "none",
      execute: ({ state }) =>
        state.checked
          ? { status: "continue", state }
          : {
              status: "paused",
              state,
              pause: { reason: "review" },
            },
    },
  ],
});

const workflow = composeWorkflow({
  workflowId: "example.publish",
  version: "2.0.0",
  definitions: [draft, review],
});

const outcome: WorkflowExecutionOutcome<State, Pause> = await runWorkflow(workflow, {
  draft: "",
  checked: false,
});

if (outcome.status === "paused") {
  console.log(outcome.snapshot.pause.reason);
}
