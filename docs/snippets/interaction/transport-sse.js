// #region docs
import { runInteractionPipeline, createInteractionPipelineWithDefaults } from "#interaction";
import { PassThrough } from "node:stream";

// In your route handler
const stream = new PassThrough(); // Your output stream
const pipeline = createInteractionPipelineWithDefaults();

await runInteractionPipeline(pipeline, {
  input: { message: { role: "user", content: "Hello" } },
  eventStream: {
    // Forward events to the stream
    emit: (event) => stream.write(`data: ${JSON.stringify(event)}\n\n`),
  },
});
// #endregion docs
