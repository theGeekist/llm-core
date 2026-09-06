import { contractVersion } from "#contracts";
import { registerNativeAgentConversationProfile } from "../../agent/runtime";

export const ANTIGRAVITY_CLI_VERSION = "1.1.27";

export const antigravityCliHooksConversationProfile = registerNativeAgentConversationProfile({
  providerId: "provider.antigravity",
  routeProfileId: "antigravity.cli-hooks.execution-boundary",
  routeProfileVersion: contractVersion("1.0.0"),
  sourceContract: {
    authority: "Google Antigravity CLI and hooks protocol",
    version: ANTIGRAVITY_CLI_VERSION,
    revision: `agy-cli:${ANTIGRAVITY_CLI_VERSION}`,
  },
  operations: [
    {
      operation: "conversation.start",
      disposition: "supported",
      evidenceRefs: ["antigravity-cli:start-headless"],
    },
    {
      operation: "conversation.continue",
      disposition: "supported",
      evidenceRefs: ["antigravity-cli:continue-idle"],
    },
    {
      operation: "run.observe",
      disposition: "supported",
      evidenceRefs: ["antigravity-cli:stream-json-hooks"],
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
