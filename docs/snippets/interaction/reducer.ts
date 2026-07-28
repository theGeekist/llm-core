// #region docs
import { createBuiltinModel } from "#adapters";
import { createInteractionHandle } from "#interaction";

const interaction = createInteractionHandle({
  adapters: { model: createBuiltinModel() },
});

const result = await interaction.run(
  { message: { role: "user", content: "Hello" } },
  { captureEvents: true },
);

console.log(result.state.messages);
console.log(result.events);
// #endregion docs
