import { Recipe } from "../flow";
import { defineSinglePackRecipe } from "../handle";
import type { RecipeDefaults, StepApply } from "../flow";
import type { PauseKind } from "#adapters/types";
import { readString } from "#adapters/utils";
import { isRecord } from "#shared/guards";
import { bindFirst } from "#shared/fp";

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

type HitlPausePayload = {
  kind: "hitl";
  input: unknown;
};

// Gate step that pauses until a decision is provided.
const applyGate = (
  pauseKind: PauseKind,
  { input, state }: Parameters<StepApply>[0],
): ReturnType<StepApply> => {
  const hitl = readStateRecord(state);
  const { decision, notes } = readDecision(input);
  if (decision) {
    hitl.decision = decision;
    hitl.notes = notes ?? undefined;
    hitl.status = decision === "approve" ? "approved" : "denied";
    return null;
  }
  hitl.status = "pending";
  const token = createPauseToken();
  state.__pause = {
    token,
    pauseKind,
    payload: {
      kind: "hitl",
      input,
    } satisfies HitlPausePayload,
  };
  return { output: state };
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const createHitlSteps =
  (pauseKind: PauseKind) =>
  ({ step }: PackTools) => ({
    gate: step("gate", bindFirst(applyGate, pauseKind)),
  });

export const createHitlPack = (config?: HitlConfig) =>
  Recipe.pack("hitl", createHitlSteps(config?.pauseKind ?? "human"), {
    defaults: config?.defaults,
    minimumCapabilities: ["hitl"],
  });

// Full HITL recipe that pauses by default and resumes when a decision is provided.
const hitl = defineSinglePackRecipe("hitl-gate", createHitlPack);
export const createHitlRecipe = hitl.createRecipe;
export const HitlPack = hitl.pack;
