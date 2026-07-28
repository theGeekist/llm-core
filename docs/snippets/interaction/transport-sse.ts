// #region docs
import { createInteractionHandle } from "#interaction";
import { createBuiltinModel, type EventStreamEvent } from "#adapters";
import { PassThrough } from "node:stream";

// In your route handler
const stream = new PassThrough(); // Your output stream
const interaction = createInteractionHandle({
  adapters: { model: createBuiltinModel() },
  eventStream: {
    // Forward events to the stream
    emit: (event: EventStreamEvent) =>
      stream.write(`data: ${JSON.stringify(event)}

`),
  },
});
await interaction.run({ message: { role: "user", content: "Hello" } });
// #endregion docs
