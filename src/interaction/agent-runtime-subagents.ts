import type { EventStream, Tool } from "#adapters/types";
import { bindFirst } from "#shared/fp";
import { maybeMap, maybeTry } from "#shared/maybe";
import type { AgentRuntimeInput, AgentRuntimeOptions } from "./agent-runtime";
import type { AgentEventState } from "./agent-runtime-events";
import {
  applySubagentOutcome,
  buildCloseResult,
  buildErrorResult,
  buildMissingResult,
  buildSpawnResult,
  buildSubagentCompleted,
  buildSubagentInteractionId,
  buildSubagentSelected,
  buildSubagentStarted,
  buildWaitResult,
  countActiveSubagents,
  createSubagentRecord,
  emitSubagentEvent,
  findSubagentRecord,
  handleSubagentRunError,
  readSendInput,
  readSpawnInput,
  readWaitInput,
  runSubagent,
  wrapLastOutcome,
  wrapSendResult,
} from "./agent-runtime-subagents-helpers";
import type {
  AgentRuntimeFactory,
  AgentSubagentOptions,
  CloseInput,
  SendInput,
  SpawnInput,
  SubagentManager,
  SubagentRecord,
  WaitInput,
} from "./agent-runtime-subagents-types";
import { DEFAULT_ID_PREFIX, DEFAULT_MAX_ACTIVE } from "./agent-runtime-subagents-types";

function incrementSequence(state: { current: number }) {
  state.current += 1;
  return state.current;
}

function createSequence() {
  return bindFirst(incrementSequence, { current: 0 });
}

function readEnabled(options?: AgentSubagentOptions) {
  return options?.enabled ?? true;
}

function readMaxActive(options?: AgentSubagentOptions) {
  return Math.max(1, options?.maxActive ?? DEFAULT_MAX_ACTIVE);
}

function readIdPrefix(options?: AgentSubagentOptions) {
  return options?.idPrefix ?? DEFAULT_ID_PREFIX;
}

function buildSubagentManager(input: {
  factory: AgentRuntimeFactory;
  runtimeOptions: AgentRuntimeOptions;
  interactionId: string;
  eventStream?: EventStream;
  eventState?: AgentEventState;
  options?: AgentSubagentOptions;
}): SubagentManager {
  return {
    records: [],
    maxActive: readMaxActive(input.options),
    idPrefix: readIdPrefix(input.options),
    nextId: createSequence(),
    runtimeFactory: input.factory,
    runtimeOptions: input.runtimeOptions,
    eventStream: input.eventStream,
    eventState: input.eventState,
    interactionId: input.interactionId,
  };
}

function ensureSubagentRecord(manager: SubagentManager, agentId: string) {
  return findSubagentRecord(manager, agentId);
}

function ensureSubagentAvailable(manager: SubagentManager, agentId: string) {
  const record = ensureSubagentRecord(manager, agentId);
  if (!record || record.status === "closed") {
    return null;
  }
  return record;
}

function buildSubagentRunInput(
  manager: SubagentManager,
  record: SubagentRecord,
  input: SendInput,
): AgentRuntimeInput {
  return {
    text: input.text,
    context: input.context,
    threadId: input.threadId,
    interactionId: buildSubagentInteractionId(manager.interactionId, record.id),
    correlationId: manager.eventState?.correlationId,
    eventStream: manager.eventStream,
  };
}

function runSubagentWithEvents(input: {
  manager: SubagentManager;
  record: SubagentRecord;
  runInput: AgentRuntimeInput;
}) {
  const run = bindFirst(runSubagent, { record: input.record, runInput: input.runInput });
  const withOutcome = maybeTry(bindFirst(handleSubagentRunError, input), run);
  const applied = maybeMap(bindFirst(applySubagentOutcome, input), withOutcome);
  return maybeMap(bindFirst(wrapSendResult, { agentId: input.record.id }), applied);
}

function spawnSubagent(manager: SubagentManager, input: SpawnInput) {
  const agentId = input.agentId ?? `${manager.idPrefix}.${manager.nextId()}`;
  const existing = findSubagentRecord(manager, agentId);
  if (existing) {
    emitSubagentEvent(manager, buildSubagentSelected(existing));
    return buildSpawnResult(existing.id, "exists");
  }
  if (countActiveSubagents(manager) >= manager.maxActive) {
    return buildErrorResult("subagent_limit_reached", { maxActive: manager.maxActive });
  }
  const record = createSubagentRecord(manager, { ...input, agentId });
  manager.records.push(record);
  emitSubagentEvent(manager, buildSubagentStarted(record));
  return buildSpawnResult(record.id, "started");
}

function sendToSubagent(manager: SubagentManager, input: SendInput) {
  const record = ensureSubagentAvailable(manager, input.agentId);
  if (!record) {
    return buildMissingResult("subagent_not_found", input.agentId);
  }
  if (record.status === "running") {
    return buildErrorResult("subagent_busy", { agentId: record.id });
  }
  record.status = "running";
  const runInput = buildSubagentRunInput(manager, record, input);
  return runSubagentWithEvents({ manager, record, runInput });
}

function waitForSubagent(manager: SubagentManager, input: WaitInput) {
  const record = ensureSubagentAvailable(manager, input.agentId);
  if (!record) {
    return buildMissingResult("subagent_not_found", input.agentId);
  }
  if (!record.lastOutcome) {
    return buildWaitResult(record.id, null);
  }
  return wrapLastOutcome({ agentId: record.id, outcome: record.lastOutcome });
}

function closeSubagent(manager: SubagentManager, input: CloseInput) {
  const record = findSubagentRecord(manager, input.agentId);
  if (!record) {
    return buildMissingResult("subagent_not_found", input.agentId);
  }
  record.status = "closed";
  emitSubagentEvent(manager, buildSubagentCompleted(record));
  return buildCloseResult(record.id, true);
}

function runSpawnTool(manager: SubagentManager, input: unknown) {
  return spawnSubagent(manager, readSpawnInput(input));
}

function runSendTool(manager: SubagentManager, input: unknown) {
  const parsed = readSendInput(input);
  if (!parsed) {
    return buildMissingResult("subagent_invalid_input");
  }
  return sendToSubagent(manager, parsed);
}

function runWaitTool(manager: SubagentManager, input: unknown) {
  const parsed = readWaitInput(input);
  if (!parsed) {
    return buildMissingResult("subagent_invalid_input");
  }
  return waitForSubagent(manager, parsed);
}

function runCloseTool(manager: SubagentManager, input: unknown) {
  const parsed = readWaitInput(input);
  if (!parsed) {
    return buildMissingResult("subagent_invalid_input");
  }
  return closeSubagent(manager, parsed);
}

function createSpawnTool(manager: SubagentManager): Tool {
  return {
    name: "agent.spawn",
    description: "Spawn a sub-agent instance.",
    execute: bindFirst(runSpawnTool, manager),
  };
}

function createSendTool(manager: SubagentManager): Tool {
  return {
    name: "agent.send",
    description: "Send input to a sub-agent and return its outcome.",
    execute: bindFirst(runSendTool, manager),
  };
}

function createWaitTool(manager: SubagentManager): Tool {
  return {
    name: "agent.wait",
    description: "Wait for a sub-agent to finish and return its last outcome.",
    execute: bindFirst(runWaitTool, manager),
  };
}

function createCloseTool(manager: SubagentManager): Tool {
  return {
    name: "agent.close",
    description: "Close a sub-agent instance.",
    execute: bindFirst(runCloseTool, manager),
  };
}

function createToolList(manager: SubagentManager): Tool[] {
  return [
    createSpawnTool(manager),
    createSendTool(manager),
    createWaitTool(manager),
    createCloseTool(manager),
  ];
}

export function buildSubagentRuntimeOptions(options: AgentRuntimeOptions): AgentRuntimeOptions {
  return {
    ...options,
    subagents: { ...(options.subagents ?? {}), enabled: false },
  };
}

export function createSubagentTools(input: {
  factory: AgentRuntimeFactory;
  runtimeOptions: AgentRuntimeOptions;
  interactionId: string;
  eventStream?: EventStream;
  eventState?: AgentEventState;
  options?: AgentSubagentOptions;
}): Tool[] | null {
  if (!readEnabled(input.options)) {
    return null;
  }
  const manager = buildSubagentManager(input);
  return createToolList(manager);
}
