// #region docs
import { createInteractionPipelineWithDefaults, registerInteractionPack } from "#interaction";

/** @type {import("#interaction").InteractionStepApply} */
const appendHint = (options) => {
  /** @type {import("#adapters").Message} */
  const message = { role: "assistant", content: "Tip: Ask for sources if needed." };
  const output = {
    ...options.output,
    messages: [...options.output.messages, message],
  };
  return { output };
};

const PostProcessPack = {
  name: "post-process",
  steps: [
    {
      name: "append-hint",
      apply: appendHint,
      dependsOn: ["interaction-core.run-model"],
    },
  ],
};

const pipeline = createInteractionPipelineWithDefaults();
registerInteractionPack(pipeline, PostProcessPack);
// #endregion docs

void pipeline;
