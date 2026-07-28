// #region docs
import { createAiSdkUiMessageChunkMapper } from "#adapters";

const mapEvent = createAiSdkUiMessageChunkMapper({ messageId: "chat-1" });
// mapEvent(event) -> UIMessageChunk[]
// #endregion docs
void mapEvent;
