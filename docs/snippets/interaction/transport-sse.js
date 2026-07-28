// #region docs
import { createBuiltinModel } from "#adapters";
import { createInteractionHandle } from "#interaction";
import { PassThrough } from "node:stream";

// In your route handler
const stream = new PassThrough(); // Your output stream
const interaction = createInteractionHandle({
  adapters: { model: createBuiltinModel() },
  eventStream: {
    // Forward events to the stream
    emit: (event) => stream.write(`data: ${JSON.stringify(event)}\n\n`),
  },
});
await interaction.run({ message: { role: "user", content: "Hello" } });
// #endregion docs
