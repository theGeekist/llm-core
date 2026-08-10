import { createInteractionSession } from "@aifsd/llm-core/interaction";
import { createAiSdkUiProjectionMapper } from "@aifsd/llm-core/adapters/ai-sdk-ui";
import type {
  ConversationStore,
  InteractionSessionIdentityPort,
} from "@aifsd/llm-core/interaction";
import type { AgentRunner, PreparedAgentDefinition } from "@aifsd/llm-core/agent/runtime";
import type { ConversationId, InvocationContext } from "@aifsd/llm-core/contracts";
import type { AiSdkUiProjectionChunk } from "@aifsd/llm-core/adapters/ai-sdk-ui";

declare const conversationId: ConversationId;
declare const agent: PreparedAgentDefinition;
declare const runner: AgentRunner;
declare const store: ConversationStore;
declare const identity: InteractionSessionIdentityPort;
declare const invocationContext: InvocationContext;
declare const uiStream: {
  write(chunk: AiSdkUiProjectionChunk): Promise<void>;
};

const session = createInteractionSession({
  conversationId,
  agent,
  runner,
  store,
  identity,
});
const interactionRun = await session.send({
  input: { prompt: "hello" },
  invocationContext,
});
const project = createAiSdkUiProjectionMapper();

for await (const event of interactionRun.events()) {
  for (const chunk of project(event)) {
    await uiStream.write(chunk);
  }
}

await interactionRun.result();
