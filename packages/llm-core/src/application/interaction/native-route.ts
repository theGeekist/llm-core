import type { ProviderSessionRef } from "../../features/state/public";
import {
  isNativeAgentRun,
  nativeAgentConversationMatches,
  nativeAgentOperation,
  type NativeAgentConversationContinuity,
  type RegisteredNativeAgentConversationProfile,
  type NativeAgentRun,
} from "../../features/agent/public";
import { registerInteractionProviderSession } from "./provider-session-registration";

const requireSupported = (
  profile: RegisteredNativeAgentConversationProfile,
  operation: "conversation.start" | "conversation.continue" | "run.observe",
): void => {
  if (nativeAgentOperation(profile, operation).disposition !== "supported") {
    throw new TypeError(
      `Native-agent route ${operation} is not supported by the selected profile.`,
    );
  }
};

export const requireNativeConversationRoute = (input: {
  readonly profile: RegisteredNativeAgentConversationProfile;
  readonly storedProviderSession?: ProviderSessionRef;
  readonly storedContinuity?: NativeAgentConversationContinuity;
  readonly providerSessionContinuation: boolean;
  readonly cancellation: "none" | "cooperative";
}): void => {
  const continuation = nativeAgentOperation(input.profile, "conversation.continue");
  if ((continuation.disposition === "supported") !== input.providerSessionContinuation) {
    throw new TypeError(
      "Native-agent continuation support must agree with the exact route operation matrix.",
    );
  }
  if (
    (nativeAgentOperation(input.profile, "run.cancel").disposition === "supported") !==
    (input.cancellation === "cooperative")
  ) {
    throw new TypeError(
      "Native-agent cancellation support must agree with the exact route operation matrix.",
    );
  }
  requireSupported(input.profile, "run.observe");
  if (!input.storedProviderSession) {
    if (input.storedContinuity) {
      throw new TypeError("Native-agent route continuity requires a stored provider session.");
    }
    requireSupported(input.profile, "conversation.start");
    return;
  }
  if (
    !input.storedContinuity ||
    !nativeAgentConversationMatches(input.profile, input.storedContinuity)
  ) {
    throw new TypeError(
      "Native-agent continuation requires the exact stored provider and route profile.",
    );
  }
  requireSupported(input.profile, "conversation.continue");
};

export const readEarlyNativeProviderSession = async (
  run: NativeAgentRun,
  profile: RegisteredNativeAgentConversationProfile,
): Promise<ProviderSessionRef | undefined> => {
  if (!isNativeAgentRun(run)) {
    throw new TypeError("Native-agent provider identity requires the complete native run surface.");
  }
  const continuationSupported =
    nativeAgentOperation(profile, "conversation.continue").disposition === "supported";
  const source = await run.providerSession();
  if (source === undefined) {
    if (continuationSupported) {
      throw new TypeError(
        "A conversation-capable native run must expose its provider session before settlement.",
      );
    }
    return source;
  }
  const session = registerInteractionProviderSession(source);
  if (!continuationSupported || session.providerId !== profile.providerId) {
    throw new TypeError(
      "Early native provider identity must agree with the exact continuable route profile.",
    );
  }
  return session;
};

export const resolveTerminalNativeProviderSession = (
  terminal: unknown,
  early: ProviderSessionRef | undefined,
  profile: RegisteredNativeAgentConversationProfile,
): ProviderSessionRef | undefined => {
  if (terminal === undefined) {
    return early;
  }
  const session = registerInteractionProviderSession(terminal);
  if (
    !early ||
    session.providerId !== profile.providerId ||
    session.providerId !== early.providerId ||
    session.sessionId !== early.sessionId
  ) {
    throw new TypeError(
      "Terminal native provider identity must agree with the cached early provider session.",
    );
  }
  return session;
};
