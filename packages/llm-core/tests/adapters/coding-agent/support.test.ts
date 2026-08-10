import { describe, expect, test } from "bun:test";
import {
  OPENHANDS_CODING_AGENT_OPERATIONS,
  OPENHANDS_PACKAGE_REQUIREMENT,
  OPENHANDS_QUALIFICATION_PROFILE,
  OPENHANDS_RESEARCH_REVISION,
  OPENHANDS_SDK_VERSION,
} from "../../../src/adapters/coding-agent/public";

describe("OpenHands exact qualification declaration", () => {
  test("pins the exact upstream and preserves integration ownership", () => {
    expect(OPENHANDS_SDK_VERSION).toBe("1.37.1");
    expect(OPENHANDS_PACKAGE_REQUIREMENT).toBe("openhands-sdk==1.37.1");
    expect(OPENHANDS_RESEARCH_REVISION).toBe("310989d306114efd0fcadbcbed9ff9c21d4a5963");
    expect(OPENHANDS_QUALIFICATION_PROFILE).toMatchObject({
      nativeSessionSemantics: "OpenHands ConversationState and event tree",
      cancellation: "native-upstream-unqualified",
      publication: "not-approved",
      ownership: {
        execution: "integration-owned",
        workspace: "integration-owned",
        trajectory: "integration-owned",
        session: "integration-owned",
      },
    });
  });

  test("declares-unqualified-native-operations-unsupported", () => {
    expect(OPENHANDS_CODING_AGENT_OPERATIONS).toHaveLength(7);
    expect(
      OPENHANDS_CODING_AGENT_OPERATIONS.filter(
        ({ disposition }) => disposition === "unsupported",
      ).map(({ operation }) => operation),
    ).toEqual([
      "native.openhands.agent-loop-execution",
      "native.openhands.live-cancellation",
      "native.openhands.session-resume",
      "native.openhands.distributed-workflow-durability",
    ]);
    expect(
      OPENHANDS_CODING_AGENT_OPERATIONS.every(
        ({ disposition, fixtures }) => disposition === "not-applicable" || fixtures.length > 0,
      ),
    ).toBe(true);
    expect(Object.isFrozen(OPENHANDS_CODING_AGENT_OPERATIONS)).toBe(true);
    expect(OPENHANDS_CODING_AGENT_OPERATIONS.every(Object.isFrozen)).toBe(true);
  });
});
