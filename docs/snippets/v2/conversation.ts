import type { ConversationEvent } from "@aifsd/llm-core/conversation";
import { createInteractionSession } from "@aifsd/llm-core/interaction";
import type { CreateInteractionSessionOptions } from "@aifsd/llm-core/interaction";

declare const options: CreateInteractionSessionOptions;
declare const render: (event: ConversationEvent) => void;

const session = createInteractionSession(options);
const projection = await session.load();

for (const event of projection.value.projection.events) {
  render(event);
}
