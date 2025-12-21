// References: docs/implementation-plan.md#L59-L60,L108-L114; docs/workflow-notes.md

import type { Outcome } from "./types";

export const isOk = (outcome: Outcome): outcome is Extract<Outcome, { status: "ok" }> =>
  outcome.status === "ok";
