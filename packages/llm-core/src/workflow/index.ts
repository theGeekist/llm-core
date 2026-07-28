import { Outcome as OutcomeImpl } from "./outcome.ts";

export const Outcome = OutcomeImpl;

export type { OutcomeSummary } from "./outcome.ts";
export type {
  AgentInput,
  Outcome as OutcomeType,
  Plugin,
  RecipeContract,
  RecipeName,
  Runtime,
} from "./types";
