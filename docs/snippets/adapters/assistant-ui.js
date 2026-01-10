// #region docs
import { createAssistantUiInteractionEventStream, fromAiSdkModel } from "#adapters";
import { createInteractionHandle } from "#interaction";
import { useAssistantTransportSendCommand } from "@assistant-ui/react";
import { openai } from "@ai-sdk/openai";

const model = fromAiSdkModel(openai("gpt-4o-mini"));

const handle = createInteractionHandle().configure({
  adapters: { model },
});

function useRunInteraction() {
  const sendCommand = useAssistantTransportSendCommand();

  /** @param {import("#adapters/types").Message} message */
  return async function runInteraction(message) {
    await handle.run(
      { message },
      { eventStream: createAssistantUiInteractionEventStream({ sendCommand }) },
    );
  };
}
// #endregion docs

void useRunInteraction;
