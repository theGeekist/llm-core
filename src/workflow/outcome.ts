// References: docs/implementation-plan.md#L59-L60,L108-L114; docs/workflow-notes.md

import type { Outcome as OutcomeType, OutcomeMatcher } from "./types";

export const ok = (outcome: OutcomeType): outcome is Extract<OutcomeType, { status: "ok" }> =>
  outcome.status === "ok";

export const match = <TArtefact, TResult>(
  outcome: OutcomeType<TArtefact>,
  matcher: OutcomeMatcher<TArtefact, TResult>,
): TResult => {
  switch (outcome.status) {
    case "ok":
      return matcher.ok(outcome);
    case "paused":
      return matcher.paused(outcome);
    case "error":
      return matcher.error(outcome);
    default:
      return throwUnexpectedOutcome(outcome);
  }
};

const throwUnexpectedOutcome = (_outcome: OutcomeType): never => {
  throw new Error("Unexpected outcome status.");
};

export const mapOk = <TArtefact, TNext>(
  outcome: OutcomeType<TArtefact>,
  map: (artefact: TArtefact) => TNext,
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
