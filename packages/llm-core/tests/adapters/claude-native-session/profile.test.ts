import { describe, expect, test } from "bun:test";
import {
  CLAUDE_CODE_VERSION,
  claudeChannelConversationProfile,
  claudeCrossSessionConversationProfile,
} from "../../../src/adapters/claude-native-session/public";

describe("Claude native-session conversation profiles", () => {
  test("pins the exact Claude version and conservatively qualifies the operation matrix", () => {
    expect(CLAUDE_CODE_VERSION).toBe("2.1.261");
    expect(
      claudeCrossSessionConversationProfile.operations.map(({ disposition }) => disposition),
    ).toEqual(["supported", "supported", "supported", "unsupported", "unsupported"]);
    expect(claudeCrossSessionConversationProfile.operations[3]).toEqual({
      operation: "run.input.submit",
      disposition: "unsupported",
      reasonCode: "qualification-failed",
    });
    expect(claudeCrossSessionConversationProfile.operations[4]).toEqual({
      operation: "run.cancel",
      disposition: "unsupported",
      reasonCode: "qualification-failed",
    });
  });

  test("keeps the Channel research-preview route distinct", () => {
    expect(claudeChannelConversationProfile.routeProfileId).toBe("claude.channel.research-preview");
    expect(
      claudeChannelConversationProfile.operations.map(({ disposition }) => disposition),
    ).toEqual([
      "not-applicable",
      "not-applicable",
      "not-applicable",
      "unsupported",
      "not-applicable",
    ]);
    expect(claudeChannelConversationProfile.operations[3]).toEqual({
      operation: "run.input.submit",
      disposition: "unsupported",
      reasonCode: "observability-insufficient",
    });
  });
});
