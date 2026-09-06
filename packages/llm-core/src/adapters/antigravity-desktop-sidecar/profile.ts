import { contractVersion } from "#contracts";
import { registerNativeAgentConversationProfile } from "../../agent/runtime";

export const ANTIGRAVITY_DESKTOP_HOST_VERSION = "2.11.0";
export const ANTIGRAVITY_DESKTOP_QUALIFIED_VERSION = "2.8.1";
export const ANTIGRAVITY_SIDECAR_CONTRACT_VERSION = "1.1.27";

export const antigravityDesktopSidecarConversationProfile = registerNativeAgentConversationProfile({
  providerId: "provider.antigravity",
  routeProfileId: "antigravity.desktop-sidecar.agentapi",
  routeProfileVersion: contractVersion("1.0.0"),
  sourceContract: {
    authority: "Google Antigravity Desktop Sidecar and agentapi protocol",
    version: ANTIGRAVITY_SIDECAR_CONTRACT_VERSION,
    revision: `antigravity-desktop:${ANTIGRAVITY_DESKTOP_HOST_VERSION}/agentapi:${ANTIGRAVITY_SIDECAR_CONTRACT_VERSION}`,
  },
  operations: [
    {
      operation: "conversation.start",
      disposition: "supported",
      evidenceRefs: ["antigravity-desktop-sidecar:agentapi-new-conversation"],
    },
    {
      operation: "conversation.continue",
      disposition: "supported",
      evidenceRefs: ["antigravity-desktop-sidecar:agentapi-send-message-idle"],
    },
    {
      operation: "run.observe",
      disposition: "unsupported",
      reasonCode: "observability-insufficient",
    },
    {
      operation: "run.input.submit",
      disposition: "unsupported",
      reasonCode: "qualification-failed",
    },
    {
      operation: "run.cancel",
      disposition: "unsupported",
      reasonCode: "qualification-failed",
    },
  ],
});
