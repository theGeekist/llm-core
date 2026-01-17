// #region docs
import { runInteractionPipeline, createInteractionPipelineWithDefaults } from "#interaction";
import type { EventStreamEvent } from "#adapters/types";
import { PassThrough } from "node:stream";

// In your route handler
const stream = new PassThrough(); // Your output stream
const pipeline = createInteractionPipelineWithDefaults();

await runInteractionPipeline(pipeline, {
  input: { message: { role: "user", content: "Hello" } },
  eventStream: {
    // Forward events to the stream
    emit: (event: EventStreamEvent) =>
      stream.write(`data: ${JSON.stringify(event)}

`),
  },
});
// #endregion docs
