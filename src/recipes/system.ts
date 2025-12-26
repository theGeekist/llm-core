import type { Plugin } from "../workflow/types";

const readSystemContext = (options: { context?: unknown }, system: string) => {
  const context = options.context as { system?: string } | undefined;
  if (!context) {
    return undefined;
  }
  context.system = system;
  return undefined;
};

export const createSystemPlugin = (system: string): Plugin => ({
  key: "config.system",
  lifecycle: "init",
  hook: (options: { context?: unknown }) => readSystemContext(options, system),
});
