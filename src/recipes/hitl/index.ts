import { Recipe } from "../flow";
import { createRecipeFactory, createRecipeHandle } from "../handle";
import type { RecipeDefaults, StepApply } from "../flow";
import type { PauseKind } from "../../adapters/types";
import { readString } from "../../adapters/utils";
import { isRecord } from "../../shared/guards";

export type HitlConfig = {
  defaults?: RecipeDefaults;
  pauseKind?: PauseKind;
};

type HitlState = {
  decision?: string;
  notes?: string;
  status?: "pending" | "approved" | "denied";
};

const HITL_STATE_KEY = "hitl";

const readStateRecord = (state: Record<string, unknown>): HitlState => {
  const raw = state[HITL_STATE_KEY];
  if (isRecord(raw)) {
    return raw as HitlState;
  }
  const fresh: HitlState = {};
  state[HITL_STATE_KEY] = fresh;
  return fresh;
};

const readDecision = (input: unknown) => {
  if (isRecord(input)) {
    const decision = readString(input.decision);
    const notes = readString(input.notes);
    return { decision, notes };
  }
  return { decision: undefined, notes: undefined };
};

const createPauseToken = () => {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.randomUUID) {
    return `hitl:${cryptoRef.randomUUID()}`;
  }
  return `hitl:${Date.now()}`;
};

// Gate step that pauses until a decision is provided.
const applyGate: StepApply = ({ input, state }) => {
  const hitl = readStateRecord(state);
  const { decision, notes } = readDecision(input);
  if (decision) {
    hitl.decision = decision;
    hitl.notes = notes ?? undefined;
    hitl.status = decision === "approve" ? "approved" : "denied";
    return null;
  }
  hitl.status = "pending";
  state.__pause = {
    paused: true,
    token: createPauseToken(),
    pauseKind: "human" satisfies PauseKind,
  };
  return {
    output: state,
    paused: true,
    pauseKind: "human" satisfies PauseKind,
    token: (state.__pause as { token?: unknown }).token,
    partialArtefact: state,
  };
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const defineHitlSteps = ({ step }: PackTools) => ({
  gate: step("gate", applyGate),
});

export const createHitlPack = (config?: HitlConfig) =>
  Recipe.pack("hitl", defineHitlSteps, {
    defaults: config?.defaults,
    minimumCapabilities: ["hitl"],
  });

const resolveHitlPack = (config?: HitlConfig) => (config ? createHitlPack(config) : HitlPack);

const resolveHitlRecipeDefinition = (config?: HitlConfig) => ({
  packs: [resolveHitlPack(config)],
});

const hitlRecipeFactory = createRecipeFactory("hitl-gate", resolveHitlRecipeDefinition);

// Full HITL recipe that pauses by default and resumes when a decision is provided.
export const createHitlRecipe = (config?: HitlConfig) =>
  createRecipeHandle(hitlRecipeFactory, config);

export const HitlPack = createHitlPack();
export const hitlRecipe = (config?: HitlConfig) => createHitlRecipe(config);
