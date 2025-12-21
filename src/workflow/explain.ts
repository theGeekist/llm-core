// References: docs/implementation-plan.md#L51-L54,L124-L130; docs/recipes-and-plugins.md

export type ExplainSnapshot = {
  plugins: string[];
  overrides: string[];
  unused: string[];
  missingRequirements?: string[];
};

export const createExplainSnapshot = (): ExplainSnapshot => ({
  plugins: [],
  overrides: [],
  unused: [],
});
