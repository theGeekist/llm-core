/** Test-only TypeScript runner support. */
import {
  resolveIntervention,
  type InterventionDecision,
  type InterventionRequest,
} from "../../../src/features/state/public";

export const resolvableInterventionAt = (
  request: InterventionRequest,
  decision: InterventionDecision,
  now: () => string,
): string | null => {
  try {
    const acceptedAt = now();
    return resolveIntervention(request, decision, acceptedAt).status === "rejected"
      ? null
      : acceptedAt;
  } catch {
    return null;
  }
};
