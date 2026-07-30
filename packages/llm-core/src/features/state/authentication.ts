import { isExternalId, isJsonValue } from "#contracts";
import { isPromiseLike, type MaybePromise } from "#shared/maybe";
import type {
  InterventionAuthenticationPort,
  InterventionAuthenticationResult,
  InterventionDecision,
  InterventionRequest,
} from "./types";
import { hasOnlyKeys, isRecord } from "./validation";

export interface AuthenticateInterventionInput {
  readonly authentication: InterventionAuthenticationPort;
  readonly request: InterventionRequest;
  readonly decision: InterventionDecision;
}

const matchesActor = (
  result: InterventionAuthenticationResult | unknown,
  decision: InterventionDecision,
): boolean => {
  try {
    return (
      isJsonValue(result) &&
      isRecord(result) &&
      hasOnlyKeys(result, ["status", "principal"]) &&
      result.status === "authenticated" &&
      isRecord(result.principal) &&
      hasOnlyKeys(result.principal, ["principalId"]) &&
      isExternalId(result.principal.principalId) &&
      result.principal.principalId === decision.actor.principalId
    );
  } catch {
    return false;
  }
};

/**
 * Normalizes an intervention verifier into a fail-closed boolean while
 * preserving synchronous ports.
 */
export const authenticateIntervention = (
  input: AuthenticateInterventionInput,
): MaybePromise<boolean> => {
  try {
    const result = input.authentication.verify({
      request: input.request,
      decision: input.decision,
    });
    return isPromiseLike(result)
      ? Promise.resolve(result).then(
          (resolved) => matchesActor(resolved, input.decision),
          () => false,
        )
      : matchesActor(result, input.decision);
  } catch {
    return false;
  }
};
