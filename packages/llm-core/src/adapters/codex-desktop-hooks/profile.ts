import { contractVersion } from "#contracts";
import { registerNativeAgentConversationProfile } from "../../agent/runtime";

export const CODEX_DESKTOP_HOST_VERSION = "26.901.31953";
export const CODEX_DESKTOP_BUNDLED_CLI_VERSION = "0.153.1";

export const codexDesktopHooksConversationProfile = registerNativeAgentConversationProfile({
  providerId: "provider.codex",
  routeProfileId: "codex.desktop-hooks.execution-boundary",
  routeProfileVersion: contractVersion("1.0.0"),
  sourceContract: {
    authority: "OpenAI Codex hooks contract",
    version: CODEX_DESKTOP_BUNDLED_CLI_VERSION,
    revision: `chatgpt-desktop:${CODEX_DESKTOP_HOST_VERSION}/codex-cli:${CODEX_DESKTOP_BUNDLED_CLI_VERSION}`,
  },
  operations: [
    {
      operation: "conversation.start",
      disposition: "unsupported",
      reasonCode: "qualification-failed",
    },
    {
      operation: "conversation.continue",
      disposition: "unsupported",
      reasonCode: "qualification-failed",
    },
    {
      operation: "run.observe",
      disposition: "unsupported",
      reasonCode: "observability-insufficient",
    },
    {
      operation: "run.input.submit",
      disposition: "supported",
      evidenceRefs: ["codex-desktop-hooks:execution-boundary-context"],
      deliveryMode: "execution-boundary",
    },
    {
      operation: "run.cancel",
      disposition: "unsupported",
      reasonCode: "qualification-failed",
    },
  ],
});
