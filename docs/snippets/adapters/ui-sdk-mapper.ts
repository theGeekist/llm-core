// #region docs
import { createAiSdkInteractionMapper } from "#adapters";

const mapper = createAiSdkInteractionMapper({ messageId: "chat-1" });
// mapper.mapEvent(event) -> UIMessageChunk[]
// #endregion docs
void mapper;
