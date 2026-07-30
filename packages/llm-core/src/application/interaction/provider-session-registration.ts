import { externalId, isExternalId, type ProviderSessionId } from "#contracts";
import { createProviderSessionRef, type ProviderSessionRef } from "../../features/state/public";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const registerInteractionProviderSession = (input: unknown): ProviderSessionRef => {
  if (
    !isRecord(input) ||
    Object.keys(input).some((key) => !["kind", "providerId", "sessionId"].includes(key)) ||
    input.kind !== "provider-session-ref" ||
    !isExternalId(input.providerId) ||
    !isExternalId(input.sessionId)
  ) {
    throw new TypeError("Provider sessions must be closed opaque references.");
  }
  return createProviderSessionRef({
    kind: "provider-session-ref",
    providerId: input.providerId,
    sessionId: externalId<ProviderSessionId>(input.sessionId),
  });
};
