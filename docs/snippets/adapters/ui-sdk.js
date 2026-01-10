// #region docs
import { createAiSdkInteractionEventStream, fromAiSdkModel } from "#adapters";
import { createInteractionHandle } from "#interaction";
import { openai } from "@ai-sdk/openai";
import { createUIMessageStream } from "ai";

const model = fromAiSdkModel(openai("gpt-4o-mini"));

const handle = createInteractionHandle().configure({
  adapters: { model },
});

/** @param {{ writer: import("ai").UIMessageStreamWriter }} param0 */
async function executeInteraction({ writer }) {
  await handle.run(
    { message: { role: "user", content: "Hello!" } },
    { eventStream: createAiSdkInteractionEventStream({ writer }) },
  );
}

const stream = createUIMessageStream({ execute: executeInteraction });
// #endregion docs

void stream;
