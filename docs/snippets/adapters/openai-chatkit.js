// #region docs
import { createChatKitInteractionEventStream, fromAiSdkModel } from "#adapters";
import { createInteractionHandle } from "#interaction";
import { openai } from "@ai-sdk/openai";

const model = fromAiSdkModel(openai("gpt-4o-mini"));
const handle = createInteractionHandle().configure({ adapters: { model } });
// #endregion docs
// @ts-expect-error - DOM types generally not available in this env
// #region docs
const doc = globalThis.document;
const chatkit = doc?.querySelector("openai-chatkit");

async function executeInteraction() {
  if (!chatkit) {
    return;
  }
  await handle.run(
    { message: { role: "user", content: "Hello!" } },
    {
      eventStream: createChatKitInteractionEventStream({
        dispatchEvent: (event) => chatkit.dispatchEvent(event),
      }),
    },
  );
}
// #endregion docs

void executeInteraction;
