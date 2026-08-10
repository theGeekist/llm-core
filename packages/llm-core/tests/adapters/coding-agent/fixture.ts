import {
  OPENHANDS_INSTALLED_CLOSURE_DIGEST,
  OPENHANDS_INSTALLED_PACKAGE_COUNT,
  OPENHANDS_LOCK_DIGEST,
  OPENHANDS_PROBE_DIGEST,
} from "../../../src/adapters/coding-agent/public";

interface NativeEventInput {
  readonly source: "user" | "agent";
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly id: string;
  readonly timestamp: string;
}

const nativeEvent = (input: NativeEventInput): string =>
  JSON.stringify({
    id: input.id,
    timestamp: input.timestamp,
    source: input.source,
    parent_id: null,
    llm_message: {
      role: input.role,
      content: [{ cache_prompt: false, type: "text", text: input.text }],
      tool_calls: null,
      tool_call_id: null,
      name: null,
      reasoning_content: null,
      thinking_blocks: [],
      responses_reasoning_item: null,
    },
    llm_response_id: null,
    activated_skills: [],
    extended_content: [],
    sender: null,
    critic_result: null,
    kind: "MessageEvent",
  });

export const repositoryChangeObservation = () => ({
  schemaVersion: "1.0.0",
  upstream: {
    name: "OpenHands Software Agent SDK",
    version: "1.37.1",
    revision: "310989d306114efd0fcadbcbed9ff9c21d4a5963",
  },
  fixture: {
    fixtureId: "governed-repository-change-v1",
    workspaceKind: "openhands-local",
    relativePath: "src/message.txt",
    before: "qualification pending\n",
    after: "qualification complete\n",
    patch:
      "--- a/src/message.txt\n+++ b/src/message.txt\n@@ -1 +1 @@\n-qualification pending\n+qualification complete\n",
  },
  permissions: {
    filesystem: ["workspace.read", "workspace.write"],
    process: ["python"],
    network: [],
    effects: ["repository.write"],
  },
  nativeEvents: [
    {
      sequence: 0,
      nativeType: "MessageEvent",
      source: "user",
      serialized: nativeEvent({
        source: "user",
        role: "user",
        text: "Apply the governed repository change.",
        id: "00000000-0000-4000-8000-000000000001",
        timestamp: "2026-08-10T15:00:00.000001",
      }),
    },
    {
      sequence: 1,
      nativeType: "MessageEvent",
      source: "agent",
      serialized: nativeEvent({
        source: "agent",
        role: "assistant",
        text: "The governed repository change is ready.",
        id: "00000000-0000-4000-8000-000000000002",
        timestamp: "2026-08-10T15:00:01.000002",
      }),
    },
  ],
  executableClosure: {
    lockDigest: OPENHANDS_LOCK_DIGEST,
    probeDigest: OPENHANDS_PROBE_DIGEST,
    installedClosureDigest: OPENHANDS_INSTALLED_CLOSURE_DIGEST,
    installedPackageCount: OPENHANDS_INSTALLED_PACKAGE_COUNT,
    interpreter: { implementation: "CPython", version: "3.12.12" },
    platform: { system: "Darwin", architecture: "arm64" },
  },
  sandbox: {
    executor: "macos-sandbox-exec",
    ambientEnvironmentInherited: false,
    credentialEnvironmentAbsent: true,
    deniedFileReadObserved: true,
    deniedFileWriteObserved: true,
    deniedNetworkObserved: true,
  },
});
