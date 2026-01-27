import type { Plugin } from "#workflow/types";

const readSystemContext = (options: { context?: unknown }, system: string) => {
  const context = options.context as { system?: string } | null;
  if (!context) {
    return null as unknown as void;
  }
  context.system = system;
  return null as unknown as void;
};

export const createSystemPlugin = (system: string): Plugin => ({
  key: "config.system",
  lifecycle: "init",
  hook: (options: { context?: unknown }) => readSystemContext(options, system),
});
