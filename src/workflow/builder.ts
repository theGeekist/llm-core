// References: docs/implementation-plan.md#L29-L33,L79-L84; docs/workflow-notes.md

import type { WorkflowRuntime } from "./runtime";

export type WorkflowBuilder = {
  use: (plugin: unknown) => WorkflowBuilder;
  build: () => WorkflowRuntime;
};

export const createBuilder = (): WorkflowBuilder => {
  const use = () => builder;
  const build = () => ({ run: () => ({ status: "error", error: new Error("not implemented"), trace: [], diagnostics: [] }) });
  const builder: WorkflowBuilder = { use, build };
  return builder;
};
