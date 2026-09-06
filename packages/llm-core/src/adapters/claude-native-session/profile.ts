import { contractVersion } from "#contracts";
import { registerNativeAgentConversationProfile } from "../../agent/runtime";

export const CLAUDE_CODE_VERSION = "2.1.261";

export const claudeCrossSessionConversationProfile = registerNativeAgentConversationProfile({
  providerId: "provider.claude",
  routeProfileId: "claude.cross-session.inbox",
  routeProfileVersion: contractVersion("1.0.0"),
  sourceContract: {
    authority: "Anthropic Claude Code cross-session messaging protocol",
    version: CLAUDE_CODE_VERSION,
    revision: `claude-code:${CLAUDE_CODE_VERSION}`,
  },
  operations: [
    {
      operation: "conversation.start",
      disposition: "supported",
      evidenceRefs: ["claude-code:claude-p-headless"],
    },
    {
      operation: "conversation.continue",
      disposition: "supported",
      evidenceRefs: ["claude-code:claude-p-resume"],
    },
    {
      operation: "run.observe",
      disposition: "supported",
      evidenceRefs: ["claude-code:stream-json-output"],
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

// Channel is a separate research-preview surface and owns no run lifecycle operations.
export const claudeChannelConversationProfile = registerNativeAgentConversationProfile({
  providerId: "provider.claude",
  routeProfileId: "claude.channel.research-preview",
  routeProfileVersion: contractVersion("1.0.0"),
  sourceContract: {
    authority: "Anthropic Claude Code Channels research preview",
    version: CLAUDE_CODE_VERSION,
    revision: `claude-code-channels:${CLAUDE_CODE_VERSION}`,
  },
  operations: [
    {
      operation: "conversation.start",
      disposition: "not-applicable",
      evidenceRefs: ["claude-channel:open-session-required"],
    },
    {
      operation: "conversation.continue",
      disposition: "not-applicable",
      evidenceRefs: ["claude-channel:open-session-required"],
    },
    {
      operation: "run.observe",
      disposition: "not-applicable",
      evidenceRefs: ["claude-channel:no-run-observation-contract"],
    },
    {
      operation: "run.input.submit",
      disposition: "unsupported",
      reasonCode: "observability-insufficient",
    },
    {
      operation: "run.cancel",
      disposition: "not-applicable",
      evidenceRefs: ["claude-channel:no-cancellation-contract"],
    },
  ],
});
