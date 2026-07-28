import type { EventStream, Tool } from "#adapters/types";
import { readRecord, readString, readStringArray } from "#adapters/utils";
import { maybeChain, maybeMap, maybeTap, maybeTry, type MaybePromise } from "#shared/maybe";
import { createTraceDiagnostics } from "#shared/reporting";
import type { Outcome } from "#workflow/types";
import type { AgentRuntime, AgentRuntimeInput, AgentRuntimeOptions } from "./agent-runtime";
import type { AgentEventState } from "./agent-runtime-events";
import { emitInteractionEvents } from "./transport";
import type { InteractionEvent, InteractionEventMeta, InteractionSubagentEvent } from "./types";
import type { AgentSubagentOptions } from "./agent-runtime-subagents-types";

const DEFAULT_MAX_ACTIVE = 4;
const DEFAULT_ID_PREFIX = "subagent";

type AgentRuntimeFactory = (options: AgentRuntimeOptions) => AgentRuntime;
type SubagentStatus = "idle" | "running" | "closed";

type SubagentRecord = {
  id: string;
  runtime: AgentRuntime;
  status: SubagentStatus;
  lastOutcome?: Outcome<unknown> | null;
  name?: string | null;
  description?: string | null;
  tools?: string[] | null;
};

type SpawnInput = {
  agentId?: string | null;
  name?: string | null;
  description?: string | null;
  tools?: string[] | null;
};

type SendInput = {
  agentId: string;
  text: string;
  context?: string;
  threadId?: string;
};

type ManagerInput = {
  factory: AgentRuntimeFactory;
  runtimeOptions: AgentRuntimeOptions;
  interactionId: string;
  eventStream?: EventStream;
  eventState?: AgentEventState;
  options?: AgentSubagentOptions;
};

const readField = (value: unknown, key: string) => readString((readRecord(value) ?? {})[key]);

const readAgentId = (value: unknown) => readField(value, "agentId");

const readSpawnInput = (value: unknown): SpawnInput => {
  const record = readRecord(value) ?? {};
  return {
    agentId: readString(record.agentId),
    name: readString(record.name),
    description: readString(record.description),
    tools: readStringArray(record.tools) ?? null,
  };
};

const readSendInput = (value: unknown): SendInput | null => {
  const agentId = readAgentId(value);
  const text = readField(value, "text");
  if (!agentId || !text) {
    return null;
  }
  return {
    agentId,
    text,
    context: readField(value, "context") ?? undefined,
    threadId: readField(value, "threadId") ?? undefined,
  };
};

const buildError = (error: string, data?: Record<string, unknown>) => ({
  ...(data ?? {}),
  error,
});

const buildAgent = (record: SubagentRecord) => ({
  id: record.id,
  name: record.name ?? record.id,
  displayName: record.name ?? record.id,
  description: record.description ?? undefined,
  tools: record.tools ?? null,
});

const buildSubagentEvent = (
  type: InteractionSubagentEvent["type"],
  record: SubagentRecord,
): InteractionSubagentEvent => ({
  type,
  error: type === "failed" ? "subagent_failed" : undefined,
  agent: buildAgent(record),
});

const createEventMeta = (state: AgentEventState, agentId: string): InteractionEventMeta => ({
  sequence: state.nextSequence(),
  timestamp: Date.now(),
  sourceId: `agent.${agentId}`,
  correlationId: state.correlationId,
  interactionId: state.interactionId,
});

const toInteractionEvent = (
  state: AgentEventState,
  event: InteractionSubagentEvent,
): InteractionEvent => ({
  kind: "subagent",
  event,
  meta: createEventMeta(state, event.agent.id),
});

const toErrorOutcome = (error: unknown): Outcome<unknown> => ({
  status: "error",
  error,
  ...createTraceDiagnostics(),
});

const buildOutcomeResult = (agentId: string, outcome: Outcome<unknown> | null) => ({
  agentId,
  outcome,
});

const restrictSubagentTools = (
  options: AgentRuntimeOptions,
  toolNames: string[] | null | undefined,
): AgentRuntimeOptions => {
  if (toolNames === null || toolNames === undefined) {
    return options;
  }
  const allowed = new Set(toolNames);
  return {
    ...options,
    adapters: {
      ...(options.adapters ?? {}),
      tools: (options.adapters?.tools ?? []).filter((tool) => allowed.has(tool.name)),
    },
  };
};

function createSubagentManager(input: ManagerInput) {
  const records = new Map<string, SubagentRecord>();
  const maxActive = Math.max(1, input.options?.maxActive ?? DEFAULT_MAX_ACTIVE);
  const idPrefix = input.options?.idPrefix ?? DEFAULT_ID_PREFIX;
  let nextId = 0;

  const emit = (event: InteractionSubagentEvent): MaybePromise<boolean | null> => {
    if (!input.eventStream || !input.eventState) {
      return null;
    }
    return emitInteractionEvents(input.eventStream, [toInteractionEvent(input.eventState, event)]);
  };

  const emitForResult = <T>(event: InteractionSubagentEvent, result: T) =>
    maybeTap(() => emit(event), result);

  const available = (agentId: string) => {
    const record = records.get(agentId);
    return record?.status === "closed" ? null : (record ?? null);
  };

  const activeCount = () => {
    let count = 0;
    for (const record of records.values()) {
      if (record.status !== "closed") {
        count += 1;
      }
    }
    return count;
  };

  const settle = (record: SubagentRecord, outcome: Outcome<unknown>) => {
    if (record.status === "closed") {
      return outcome;
    }
    record.status = "idle";
    record.lastOutcome = outcome;
    const type = outcome.status === "error" ? "failed" : "completed";
    return maybeTap(() => emit(buildSubagentEvent(type, record)), outcome);
  };

  const spawn: NonNullable<Tool["execute"]> = ({ input: value }) => {
    const parsed = readSpawnInput(value);
    if (parsed.agentId === null || parsed.agentId === undefined) {
      nextId += 1;
    }
    const agentId = parsed.agentId ?? `${idPrefix}.${nextId}`;
    const existing = records.get(agentId);
    if (existing && existing.status !== "closed") {
      return emitForResult(buildSubagentEvent("selected", existing), {
        agentId,
        status: "exists",
      });
    }
    if (existing) {
      records.delete(agentId);
    }
    if (activeCount() >= maxActive) {
      return buildError("subagent_limit_reached", { maxActive });
    }
    const record: SubagentRecord = {
      id: agentId,
      runtime: input.factory(restrictSubagentTools(input.runtimeOptions, parsed.tools)),
      status: "idle",
      name: parsed.name ?? null,
      description: parsed.description ?? null,
      tools: parsed.tools ?? null,
    };
    records.set(agentId, record);
    return emitForResult(buildSubagentEvent("started", record), {
      agentId,
      status: "started",
    });
  };

  const send: NonNullable<Tool["execute"]> = ({ input: value }) => {
    const parsed = readSendInput(value);
    if (!parsed) {
      return buildError("subagent_invalid_input");
    }
    const record = available(parsed.agentId);
    if (!record) {
      return buildError("subagent_not_found", { agentId: parsed.agentId });
    }
    if (record.status === "running") {
      return buildError("subagent_busy", { agentId: record.id });
    }
    record.status = "running";
    const runInput: AgentRuntimeInput = {
      text: parsed.text,
      context: parsed.context,
      threadId: parsed.threadId,
      interactionId: `${input.interactionId}.subagent.${record.id}`,
      correlationId: input.eventState?.correlationId,
      eventStream: input.eventStream,
    };
    const outcome = maybeTry(toErrorOutcome, () => record.runtime.run(runInput));
    const settled = maybeChain((result) => settle(record, result), outcome);
    return maybeMap((result) => buildOutcomeResult(record.id, result), settled);
  };

  const wait: NonNullable<Tool["execute"]> = ({ input: value }) => {
    const agentId = readAgentId(value);
    if (!agentId) {
      return buildError("subagent_invalid_input");
    }
    const record = available(agentId);
    if (!record) {
      return buildError("subagent_not_found", { agentId });
    }
    return buildOutcomeResult(record.id, record.lastOutcome ?? null);
  };

  const close: NonNullable<Tool["execute"]> = ({ input: value }) => {
    const agentId = readAgentId(value);
    if (!agentId) {
      return buildError("subagent_invalid_input");
    }
    const record = records.get(agentId);
    if (!record) {
      return buildError("subagent_not_found", { agentId });
    }
    record.status = "closed";
    return emitForResult(buildSubagentEvent("completed", record), {
      agentId,
      closed: true,
    });
  };

  return [
    {
      name: "agent.spawn",
      description: "Spawn a sub-agent instance.",
      execute: spawn,
    },
    {
      name: "agent.send",
      description: "Send input to a sub-agent and return its outcome.",
      execute: send,
    },
    {
      name: "agent.wait",
      description: "Read a sub-agent's last known outcome.",
      execute: wait,
    },
    {
      name: "agent.close",
      description: "Close a sub-agent instance.",
      execute: close,
    },
  ] satisfies Tool[];
}

export function buildSubagentRuntimeOptions(options: AgentRuntimeOptions): AgentRuntimeOptions {
  return {
    ...options,
    subagents: { ...(options.subagents ?? {}), enabled: false },
  };
}

export function createSubagentTools(input: ManagerInput): Tool[] | null {
  if (!(input.options?.enabled ?? true)) {
    return null;
  }
  return createSubagentManager(input);
}
