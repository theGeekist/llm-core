import { Workflow } from "#workflow/builder";

export type RagChatConfig = {
  model?: string;
  retriever?: string;
  system?: string;
};

export const ragChat = (config?: RagChatConfig) => {
  const workflow = Workflow.recipe("rag");

  if (config?.model) {
    workflow.use({
      key: "config.model",
      capabilities: {
        model: { name: config.model },
      },
    });
  }

  if (config?.retriever) {
    workflow.use({
      key: "config.retriever",
      capabilities: {
        retriever: { name: config.retriever },
      },
    });
  }

  if (config?.system) {
    const system = config.system;
    workflow.use({
      key: "config.system",
      lifecycle: "init",
      hook: ((_input: unknown, context: { system?: string }) => {
        context.system = system;
        return undefined;
      }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    });
  }

  return workflow;
};
