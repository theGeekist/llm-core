import { isContractVersion, isExternalId, isJsonValue } from "#contracts";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import type {
  NativeAgentConversationContinuity,
  NativeAgentConversationProfile,
  NativeAgentOperationDeclaration,
  NativeAgentOperationId,
  NativeAgentOperationMatrix,
  NativeAgentUnsupportedReasonCode,
  RegisteredNativeAgentConversationProfile,
} from "./types";

const OPERATION_IDS = [
  "conversation.start",
  "conversation.continue",
  "run.observe",
  "run.input.submit",
  "run.cancel",
] as const satisfies readonly NativeAgentOperationId[];

const UNSUPPORTED_REASONS = new Set<NativeAgentUnsupportedReasonCode>([
  "not-implemented",
  "qualification-failed",
  "version-drift",
  "observability-insufficient",
  "provider-unsupported",
]);

const registeredProfiles = new WeakSet<object>();

const isSafeText = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 255 &&
  ![...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });

const isEvidenceRefs = (value: unknown): value is readonly [string, ...string[]] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(isExternalId) &&
  new Set(value).size === value.length;

const isOperation = <TOperation extends NativeAgentOperationId>(
  value: unknown,
  operation: TOperation,
): value is NativeAgentOperationDeclaration<TOperation> => {
  if (!isPortableRecord(value) || value.operation !== operation) {
    return false;
  }
  if (
    value.disposition === "supported" &&
    isEvidenceRefs(value.evidenceRefs) &&
    (operation === "run.input.submit"
      ? hasOnlyKeys(value, ["operation", "disposition", "evidenceRefs", "deliveryMode"]) &&
        (value.deliveryMode === "native-live" || value.deliveryMode === "execution-boundary")
      : hasOnlyKeys(value, ["operation", "disposition", "evidenceRefs"]))
  ) {
    return true;
  }
  if (
    value.disposition === "unsupported" &&
    hasOnlyKeys(value, ["operation", "disposition", "reasonCode"]) &&
    UNSUPPORTED_REASONS.has(value.reasonCode as NativeAgentUnsupportedReasonCode)
  ) {
    return true;
  }
  return (
    value.disposition === "not-applicable" &&
    hasOnlyKeys(value, ["operation", "disposition", "evidenceRefs"]) &&
    isEvidenceRefs(value.evidenceRefs)
  );
};

const isOperationMatrix = (value: unknown): value is NativeAgentOperationMatrix =>
  Array.isArray(value) &&
  value.length === OPERATION_IDS.length &&
  OPERATION_IDS.every((operation, index) => isOperation(value[index], operation));

const isSourceContract = (value: unknown): boolean =>
  isPortableRecord(value) &&
  hasOnlyKeys(value, ["authority", "version", "revision"]) &&
  isSafeText(value.authority) &&
  isSafeText(value.version) &&
  isExternalId(value.revision);

export const registerNativeAgentConversationProfile = (
  input: unknown,
): RegisteredNativeAgentConversationProfile => {
  if (
    !isPortableRecord(input) ||
    !isJsonValue(input) ||
    !hasOnlyKeys(input, [
      "providerId",
      "routeProfileId",
      "routeProfileVersion",
      "sourceContract",
      "operations",
    ]) ||
    !isExternalId(input.providerId) ||
    !isExternalId(input.routeProfileId) ||
    !isContractVersion(input.routeProfileVersion) ||
    !isSourceContract(input.sourceContract) ||
    !isOperationMatrix(input.operations)
  ) {
    throw new TypeError(
      "Native-agent profiles require one closed exact disposition for every portable operation.",
    );
  }
  const profile = cloneFrozen(input) as unknown as RegisteredNativeAgentConversationProfile;
  registeredProfiles.add(profile);
  return profile;
};

export const isRegisteredNativeAgentConversationProfile = (
  value: unknown,
): value is RegisteredNativeAgentConversationProfile =>
  typeof value === "object" && value !== null && registeredProfiles.has(value);

export const nativeAgentOperation = <TOperation extends NativeAgentOperationId>(
  profile: RegisteredNativeAgentConversationProfile,
  operation: TOperation,
): NativeAgentOperationDeclaration<TOperation> => {
  if (!isRegisteredNativeAgentConversationProfile(profile)) {
    throw new TypeError("Native-agent operations require a registered route profile.");
  }
  const index = OPERATION_IDS.indexOf(operation);
  if (index < 0) {
    throw new TypeError("Native-agent operations require a known portable operation ID.");
  }
  return profile.operations[index] as NativeAgentOperationDeclaration<TOperation>;
};

export const nativeAgentConversationContinuity = (
  profile: RegisteredNativeAgentConversationProfile,
): NativeAgentConversationContinuity => {
  if (!isRegisteredNativeAgentConversationProfile(profile)) {
    throw new TypeError("Native-agent continuity requires a registered route profile.");
  }
  return cloneFrozen({
    providerId: profile.providerId,
    routeProfileId: profile.routeProfileId,
    routeProfileVersion: profile.routeProfileVersion,
  });
};

export const registerNativeAgentConversationContinuity = (
  input: unknown,
): NativeAgentConversationContinuity => {
  if (
    !isPortableRecord(input) ||
    !hasOnlyKeys(input, ["providerId", "routeProfileId", "routeProfileVersion"]) ||
    !isExternalId(input.providerId) ||
    !isExternalId(input.routeProfileId) ||
    !isContractVersion(input.routeProfileVersion)
  ) {
    throw new TypeError("Native-agent continuity requires exact provider and route identity.");
  }
  return cloneFrozen(input) as unknown as NativeAgentConversationContinuity;
};

export const nativeAgentConversationMatches = (
  profile: RegisteredNativeAgentConversationProfile,
  continuity: NativeAgentConversationContinuity,
): boolean => {
  const current = nativeAgentConversationContinuity(profile);
  const registered = registerNativeAgentConversationContinuity(continuity);
  return (
    current.providerId === registered.providerId &&
    current.routeProfileId === registered.routeProfileId &&
    current.routeProfileVersion === registered.routeProfileVersion
  );
};

export const isNativeAgentConversationProfile = (
  value: unknown,
): value is NativeAgentConversationProfile => {
  try {
    registerNativeAgentConversationProfile(value);
    return true;
  } catch {
    return false;
  }
};
