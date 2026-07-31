import { defineWorkflow, type WorkflowResult } from "@geekist/llm-core/workflow";

type State = {
  readonly draft: string;
  readonly checked: boolean;
};

type Pause = {
  readonly reason: "review";
};

const publishing = defineWorkflow<State, Pause>({
  steps: [
    {
      key: "draft",
      effect: "none",
      execute: ({ state }) => ({
        status: "continue",
        state: { ...state, draft: "A portable result." },
      }),
    },
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

const outcome: WorkflowResult<State, Pause> = await publishing.run({
  draft: "",
  checked: false,
});

if (outcome.status === "paused") {
  console.log(outcome.snapshot.pause.reason);
}
