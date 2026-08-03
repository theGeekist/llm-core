import type { ConversationEvent } from "@geekist/llm-core/conversation";
import { createInteractionSession } from "@geekist/llm-core/interaction";
import type { CreateInteractionSessionOptions } from "@geekist/llm-core/interaction";

declare const options: CreateInteractionSessionOptions;
declare const render: (event: ConversationEvent) => void;

const session = createInteractionSession(options);
const projection = await session.load();

for (const event of projection.value.projection.events) {
  render(event);
}
