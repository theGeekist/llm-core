// References: docs/implementation-plan.md#L59-L60,L108-L114; docs/workflow-notes.md

import type { Outcome as OutcomeType } from "./types";

export const ok = (outcome: OutcomeType): outcome is Extract<OutcomeType, { status: "ok" }> =>
  outcome.status === "ok";

type OutcomeMatcher<TArtefact, TResult> = {
  ok: (outcome: Extract<OutcomeType<TArtefact>, { status: "ok" }>) => TResult;
  needsHuman: (outcome: Extract<OutcomeType<TArtefact>, { status: "needsHuman" }>) => TResult;
  error: (outcome: Extract<OutcomeType<TArtefact>, { status: "error" }>) => TResult;
};

export const match = <TArtefact, TResult>(
  outcome: OutcomeType<TArtefact>,
  matcher: OutcomeMatcher<TArtefact, TResult>
): TResult => {
  switch (outcome.status) {
    case "ok":
      return matcher.ok(outcome);
    case "needsHuman":
      return matcher.needsHuman(outcome);
    case "error":
      return matcher.error(outcome);
  }
};

export const mapOk = <TArtefact, TNext>(
  outcome: OutcomeType<TArtefact>,
  map: (artefact: TArtefact) => TNext
): OutcomeType<TNext> | Exclude<OutcomeType<TArtefact>, { status: "ok" }> => {
  if (outcome.status === "ok") {
    return {
      ...outcome,
      artefact: map(outcome.artefact),
    };
  }
  return outcome;
};

export const Outcome = {
  ok,
  match,
  mapOk,
};
