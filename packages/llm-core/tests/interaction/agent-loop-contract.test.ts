import { describe, expect, it } from "bun:test";
import type {
  AgentLoopConfig,
  AgentLoopStateSnapshot,
  InteractionEvent,
  InteractionEventMeta,
  InteractionItemEvent,
  InteractionState,
  InteractionSubagentEvent,
} from "#interaction";
import { reduceInteractionEvent, toEventStreamEvent } from "#interaction";
import { createTraceDiagnostics } from "#shared/reporting";

const DEFAULT_META: InteractionEventMeta = {
  sequence: 1,
  timestamp: 0,
  sourceId: "test",
};

function createAgentLoopConfig(): AgentLoopConfig {
  return {
    agents: [
      {
        id: "agent-1",
        name: "Primary",
        description: "Primary agent",
        prompt: "Be helpful.",
        tools: ["tools.search"],
        mcpServers: {
          docs: {
            type: "http",
            url: "https://example.com/mcp",
            tools: ["*"],
          },
        },
        infer: true,
      },
    ],
    agentSelection: { agentId: "agent-1", allowInfer: true },
    skills: { directories: ["./skills"], disabled: ["legacy-skill"] },
    tools: { allowlist: ["tools.search"], denylist: ["tools.write"] },
    mcpServers: {
      shared: {
        type: "sse",
        url: "https://example.com/mcp-sse",
        tools: ["read"],
      },
    },
    approvals: { policy: "on-request", cache: "session" },
  };
}

function createAgentLoopSnapshot(): AgentLoopStateSnapshot {
  return {
    selectedAgentId: "agent-1",
    skills: [
      {
        id: "skill-1",
        scope: "repo",
        path: "/repo/skills/skill-1/SKILL.md",
        hash: "hash-1",
      },
    ],
    toolAllowlist: ["tools.search"],
    approvalCacheKeys: ["approval-1"],
  };
}

function createItemEventPayload(): InteractionItemEvent {
  return {
    type: "started",
    item: {
      id: "item-1",
      details: {
        type: "todo_list",
        items: [{ text: "Inspect", completed: false }],
      },
    },
  };
}

function createSubagentEventPayload(): InteractionSubagentEvent {
  return {
    type: "selected",
    agent: {
      id: "agent-1",
      name: "Primary",
      displayName: "Primary Agent",
      tools: ["tools.search"],
    },
    toolCallId: "call-1",
  };
}

function createItemEvent(): InteractionEvent {
  return {
    kind: "item",
    event: createItemEventPayload(),
    meta: DEFAULT_META,
  };
}

function createSubagentEvent(): InteractionEvent {
  return {
    kind: "subagent",
    event: createSubagentEventPayload(),
    meta: DEFAULT_META,
  };
}

function createInteractionState(): InteractionState {
  return {
    ...createTraceDiagnostics(),
    messages: [],
    events: [],
  };
}

function testAgentLoopConfigShape(): void {
  const config = createAgentLoopConfig();
  expect(config.agents?.[0]?.id ?? null).toBe("agent-1");
  expect(config.agentSelection?.agentId).toBe("agent-1");
}

function testAgentLoopSnapshotShape(): void {
  const snapshot = createAgentLoopSnapshot();
  expect(snapshot.skills?.[0]?.hash ?? null).toBe("hash-1");
  expect(snapshot.selectedAgentId).toBe("agent-1");
}

function testItemEventStreamMapping(): void {
  const mapped = toEventStreamEvent(createItemEvent());
  expect(mapped.name).toBe("interaction.item");
  expect((mapped.data as { event: InteractionEvent } | undefined)?.event.kind ?? null).toBe("item");
}

function testSubagentEventStreamMapping(): void {
  const mapped = toEventStreamEvent(createSubagentEvent());
  expect(mapped.name).toBe("interaction.subagent");
  expect((mapped.data as { event: InteractionEvent } | undefined)?.event.kind ?? null).toBe(
    "subagent",
  );
}

function testReducerAcceptsItemEvent(): void {
  const state = createInteractionState();
  const next = reduceInteractionEvent(state, createItemEvent());
  expect(next.events?.length ?? 0).toBe(1);
}

function testReducerAcceptsSubagentEvent(): void {
  const state = createInteractionState();
  const next = reduceInteractionEvent(state, createSubagentEvent());
  expect(next.events?.length ?? 0).toBe(1);
}

function describeAgentLoopContract(): void {
  it("accepts the agent loop config shape", testAgentLoopConfigShape);
  it("accepts the agent loop snapshot shape", testAgentLoopSnapshotShape);
  it("maps item events into the event stream", testItemEventStreamMapping);
  it("maps subagent events into the event stream", testSubagentEventStreamMapping);
  it("reduces item events without error", testReducerAcceptsItemEvent);
  it("reduces subagent events without error", testReducerAcceptsSubagentEvent);
}

describe("agent loop contract", describeAgentLoopContract);
