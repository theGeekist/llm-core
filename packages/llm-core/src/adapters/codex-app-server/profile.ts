import { contractVersion } from "#contracts";
import { registerNativeAgentConversationProfile } from "../../agent/runtime";

export const CODEX_APP_SERVER_VERSION = "0.147.0";

export const codexAppServerConversationProfile = registerNativeAgentConversationProfile({
  providerId: "provider.codex",
  routeProfileId: "codex.app-server.coordinator-owned",
  routeProfileVersion: contractVersion("1.0.0"),
  sourceContract: {
    authority: "OpenAI Codex app-server protocol",
    version: CODEX_APP_SERVER_VERSION,
    revision: "codex-cli:0.147.0",
  },
  operations: [
    {
      operation: "conversation.start",
      disposition: "supported",
      evidenceRefs: ["codex-app-server:thread-start-turn-start"],
    },
    {
      operation: "conversation.continue",
      disposition: "supported",
      evidenceRefs: ["codex-app-server:thread-resume-turn-start"],
    },
    {
      operation: "run.observe",
      disposition: "supported",
      evidenceRefs: ["codex-app-server:turn-notifications"],
    },
    {
      operation: "run.input.submit",
      disposition: "supported",
      evidenceRefs: ["codex-app-server:turn-steer"],
      deliveryMode: "native-live",
    },
    {
      operation: "run.cancel",
      disposition: "supported",
      evidenceRefs: ["codex-app-server:turn-interrupt"],
    },
  ],
});
