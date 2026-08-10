import type { CodingAgentOperationDeclaration, OpenHandsQualificationProfile } from "./types";

export const OPENHANDS_SDK_VERSION = "1.37.1" as const;
export const OPENHANDS_PACKAGE_REQUIREMENT = "openhands-sdk==1.37.1" as const;
export const OPENHANDS_RESEARCH_REVISION = "310989d306114efd0fcadbcbed9ff9c21d4a5963" as const;
export const OPENHANDS_LOCK_DIGEST =
  "sha256:9dffe5d1a15449bfe6cbb91bee0ccf1698d5c781bb4e1d3a9bc294667b62b33b" as const;
export const OPENHANDS_PROBE_DIGEST =
  "sha256:8788f1cbc05bd29e24e8e5573f10ebf4fcdddff410cddc35abd12cf6f4888391" as const;
export const OPENHANDS_INSTALLED_CLOSURE_DIGEST =
  "sha256:adc85b9508113e39f1bbcb9eded886fe09155e88120881ebd2cdf3a8c435c8d2" as const;
export const OPENHANDS_INSTALLED_PACKAGE_COUNT = 125 as const;

const openHandsContract = Object.freeze({
  authority: "OpenHands Software Agent SDK",
  version: OPENHANDS_SDK_VERSION,
  revision: OPENHANDS_RESEARCH_REVISION,
});

const llmCoreContract = Object.freeze({
  authority: "@geekist/llm-core coding-agent qualification",
  version: "2.0.0",
  revision: OPENHANDS_RESEARCH_REVISION,
});

const operation = (
  declaration: Omit<CodingAgentOperationDeclaration, "fixtures"> & {
    readonly fixtures: readonly string[];
  },
): CodingAgentOperationDeclaration =>
  Object.freeze({ ...declaration, fixtures: Object.freeze([...declaration.fixtures]) });

export const OPENHANDS_CODING_AGENT_OPERATIONS: readonly CodingAgentOperationDeclaration[] =
  Object.freeze([
    operation({
      operation: "native.openhands.message-event-round-trip",
      disposition: "supported",
      owner: "OpenHands Software Agent SDK",
      contract: openHandsContract,
      fixtures: [
        "apps/coding-agent-qualification/qualification/native-probe.py#message-event-round-trip",
      ],
    }),
    operation({
      operation: "portable.coding-agent.repository-change-evidence",
      disposition: "supported",
      owner: "@geekist/llm-core",
      contract: llmCoreContract,
      fixtures: [
        "apps/coding-agent-qualification/qualification.test.ts#projects-governed-repository-change-evidence",
      ],
    }),
    operation({
      operation: "native.openhands.local-workspace-file-round-trip",
      disposition: "supported",
      owner: "OpenHands Software Agent SDK",
      contract: openHandsContract,
      fixtures: [
        "apps/coding-agent-qualification/qualification/native-probe.py#local-workspace-file-round-trip",
      ],
    }),
    operation({
      operation: "native.openhands.agent-loop-execution",
      disposition: "unsupported",
      owner: "OpenHands Software Agent SDK",
      contract: openHandsContract,
      fixtures: [
        "packages/llm-core/tests/adapters/coding-agent/support.test.ts#declares-unqualified-native-operations-unsupported",
      ],
    }),
    operation({
      operation: "native.openhands.live-cancellation",
      disposition: "unsupported",
      owner: "OpenHands Software Agent SDK",
      contract: openHandsContract,
      fixtures: [
        "packages/llm-core/tests/adapters/coding-agent/support.test.ts#declares-unqualified-native-operations-unsupported",
      ],
    }),
    operation({
      operation: "native.openhands.session-resume",
      disposition: "unsupported",
      owner: "OpenHands Software Agent SDK",
      contract: openHandsContract,
      fixtures: [
        "packages/llm-core/tests/adapters/coding-agent/support.test.ts#declares-unqualified-native-operations-unsupported",
      ],
    }),
    operation({
      operation: "native.openhands.distributed-workflow-durability",
      disposition: "unsupported",
      owner: "OpenHands Software Agent SDK",
      contract: openHandsContract,
      fixtures: [
        "context/aifsd-research/profiles/openhands-sdk.md#what-this-durability-does-and-does-not-mean",
      ],
    }),
  ]);

export const OPENHANDS_QUALIFICATION_PROFILE: OpenHandsQualificationProfile = Object.freeze({
  integration: "OpenHands Software Agent SDK",
  version: OPENHANDS_SDK_VERSION,
  revision: OPENHANDS_RESEARCH_REVISION,
  packageRequirement: OPENHANDS_PACKAGE_REQUIREMENT,
  permissions: Object.freeze({
    filesystem: Object.freeze(["workspace.read", "workspace.write"] as const),
    process: Object.freeze(["python"] as const),
    network: Object.freeze([] as string[]),
    effects: Object.freeze(["repository.write"] as const),
  }),
  ownership: Object.freeze({
    execution: "integration-owned",
    workspace: "integration-owned",
    trajectory: "integration-owned",
    session: "integration-owned",
    portableProjection: "llm-core-owned",
  }),
  nativeSessionSemantics: "OpenHands ConversationState and event tree",
  cancellation: "native-upstream-unqualified",
  publication: "not-approved",
});
