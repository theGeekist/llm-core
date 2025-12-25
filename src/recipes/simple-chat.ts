import { Workflow } from "#workflow/builder";

export type SimpleChatConfig = {
  model?: string;
  system?: string;
};

export const simpleChat = (config?: SimpleChatConfig) => {
  const workflow = Workflow.recipe("agent");

  if (config?.model) {
    workflow.use({
      key: "config.model",
      capabilities: {
        model: { name: config.model },
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
