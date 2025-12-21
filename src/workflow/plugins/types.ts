// References: docs/implementation-plan.md#L39-L42; docs/workflow-notes.md; docs/recipes-and-plugins.md

export type Plugin = {
  key: string;
  mode?: "extend" | "override";
  capabilities?: Record<string, unknown>;
  requires?: string[];
  emits?: string[];
};
