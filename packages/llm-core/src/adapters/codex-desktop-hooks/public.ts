export {
  CODEX_DESKTOP_BUNDLED_CLI_VERSION,
  CODEX_DESKTOP_HOST_VERSION,
  codexDesktopHooksConversationProfile,
} from "./profile";
export { createCodexDesktopHookBridge } from "./bridge";
export type {
  CodexDesktopHookBoundary,
  CodexDesktopHookBridge,
  CodexDesktopHookClaim,
  CodexDesktopHookIdentity,
  CodexDesktopHookInbox,
  CodexDesktopHookInboxEnvelope,
  CodexDesktopHookInvocationProjection,
  CodexDesktopHookOutput,
  CodexDesktopHookProjectedInput,
  CodexDesktopHookRefusedInput,
  CodexDesktopHookTarget,
  CodexDesktopPreparedHookResult,
} from "./protocol";
