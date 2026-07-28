// #region docs
import { createInteractionHandle } from "#interaction";

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

/** @type {import("#interaction").InteractionStepPack} */
const postProcess = {
  name: "post-process",
  steps: [
    {
      name: "append-hint",
      apply: appendHint,
      dependsOn: ["interaction-core.run-model"],
    },
  ],
};

const interaction = createInteractionHandle().use(postProcess);
// #endregion docs

void interaction;
