import type { InterventionAuthenticationPort } from "../../features/state/public";
import type { CreateLocalAgentRunnerOptions } from "./types";

export const readInterventionAuthentication = (
  options: CreateLocalAgentRunnerOptions,
): InterventionAuthenticationPort | undefined => {
  const authentication = options.interventions?.authentication;
  if (
    options.interventions !== undefined &&
    (authentication === undefined || typeof authentication.verify !== "function")
  ) {
    throw new TypeError("Local interventions require an authentication port.");
  }
  return authentication;
};
