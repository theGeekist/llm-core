import type { AdapterBundle, EventStream, Model, Tool } from "#adapters/types";
import type { MaybePromise } from "#shared/maybe";
import { maybeChain } from "#shared/maybe";
import { bindFirst } from "#shared/fp";
import type { Outcome, Runtime } from "#workflow/types";
import { createStreamingModelForInteraction } from "#workflow/stream";
import type { AgentInputOptions } from "#recipes/inputs";
import { inputs } from "#recipes/inputs";
import type { RecipeRunOverrides } from "#recipes/handle";
import { createRecipeRunner, type RecipeRunner } from "#recipes/runner";
import { maybeTap } from "#shared/maybe";
import type { AgentLoopConfig, AgentLoopStateSnapshot, InteractionState } from "./types";
import type { AgentEventState } from "./agent-runtime-events";
import {
  appendAgentLoopSnapshot,
  createAgentEventState,
  emitAgentLoopEvents,
  validateAgentSelection,
} from "./agent-runtime-events";
import type { AgentSkillState } from "./agent-runtime-skills";
import { resolveAgentSkills } from "./agent-runtime-skills";
import type { AgentSubagentOptions } from "./agent-runtime-subagents-types";
import { buildSubagentRuntimeOptions, createSubagentTools } from "./agent-runtime-subagents";
import type { DiagnosticEntry } from "#shared/reporting";
import { addDiagnostic } from "#shared/reporting";

export type AgentRuntimeOptions = {
  config?: AgentLoopConfig;
  model: Model;
  adapters?: AdapterBundle;
  providers?: Record<string, string>;
  runtime?: Runtime;
  subagents?: AgentSubagentOptions;
};

export type AgentRuntimeInput = AgentInputOptions & {
  interactionId?: string;
  correlationId?: string;
  eventStream?: EventStream;
  state?: InteractionState;
};

export type AgentRuntimeOverrides = {
  adapters?: AdapterBundle;
  providers?: Record<string, string>;
  runtime?: Runtime;
  interactionId?: string;
  correlationId?: string;
  eventStream?: EventStream;
};

export type AgentRuntime = {
  run: (
    input: AgentRuntimeInput,
    overrides?: AgentRuntimeOverrides,
  ) => MaybePromise<Outcome<unknown>>;
  stream: (
    input: AgentRuntimeInput,
    overrides?: AgentRuntimeOverrides,
  ) => MaybePromise<Outcome<unknown>>;
};

type AgentRuntimeState = {
  options: AgentRuntimeOptions;
  runner: RecipeRunner;
};

function createAgentRuntimeState(options: AgentRuntimeOptions): AgentRuntimeState {
  return {
    options,
    runner: createRecipeRunner({
      recipeId: "agent",
      model: options.model,
      adapters: options.adapters,
      providers: options.providers,
      runtime: options.runtime,
    }),
  };
}

function toAgentInputOptions(input: AgentRuntimeInput): AgentInputOptions {
  return {
    text: input.text,
    context: input.context,
    threadId: input.threadId,
  };
}

function readEventStream(
  input: AgentRuntimeInput,
  overrides?: AgentRuntimeOverrides,
): EventStream | undefined {
  return overrides?.eventStream ?? input.eventStream;
}

function readInteractionId(
  input: AgentRuntimeInput,
  overrides: AgentRuntimeOverrides | undefined,
): string {
  return overrides?.interactionId ?? input.interactionId ?? input.threadId ?? "agent-loop";
}

function readCorrelationId(
  input: AgentRuntimeInput,
  overrides: AgentRuntimeOverrides | undefined,
  interactionId: string,
): string {
  return overrides?.correlationId ?? input.correlationId ?? interactionId;
}

function readStartSequence(state?: InteractionState): number | undefined {
  return state?.lastSequence;
}

function buildStreamingModel(
  state: AgentRuntimeState,
  eventStream: EventStream | undefined,
  eventState: AgentEventState | undefined,
): Model | null {
  if (!eventStream || !eventState) {
    return null;
  }
  return createStreamingModelForInteraction({
    model: state.options.model,
    eventStream,
    interactionId: eventState.interactionId,
    correlationId: eventState.correlationId,
    nextSequence: eventState.nextSequence,
    nextSourceId: eventState.nextSourceId,
  });
}

function mergeAdapterBundles(
  base?: AdapterBundle,
  next?: AdapterBundle,
): AdapterBundle | undefined {
  if (base && next) {
    return { ...base, ...next };
  }
  return base ?? next;
}

type AdapterOverrideInput = {
  input: AgentRuntimeInput;
  overrides?: AgentRuntimeOverrides;
  streamingModel?: Model;
  tools?: Tool[] | null;
};

function mergeTools(base?: Tool[] | null, next?: Tool[] | null): Tool[] | null {
  if (!base && !next) {
    return null;
  }
  const merged = new Map<string, Tool>();
  if (base) {
    for (const tool of base) {
      merged.set(tool.name, tool);
    }
  }
  if (next) {
    for (const tool of next) {
      merged.set(tool.name, tool);
    }
  }
  return Array.from(merged.values());
}

function buildAdapterOverrides(input: AdapterOverrideInput): AdapterBundle | undefined {
  const eventStream = readEventStream(input.input, input.overrides);
  const additions: AdapterBundle = {};
  if (input.streamingModel) {
    additions.model = input.streamingModel;
  }
  if (eventStream) {
    additions.eventStream = eventStream;
  }
  if (input.tools) {
    additions.tools = input.tools;
  }
  const additionsEmpty = !additions.model && !additions.eventStream && !additions.tools;
  if (additionsEmpty) {
    return input.overrides?.adapters;
  }
  return mergeAdapterBundles(input.overrides?.adapters, additions);
}

function buildRecipeOverrides(input: {
  adapters?: AdapterBundle;
  providers?: Record<string, string>;
  runtime?: Runtime;
}): RecipeRunOverrides | null {
  if (!input.adapters && !input.providers && !input.runtime) {
    return null;
  }
  const overrides: RecipeRunOverrides = {};
  if (input.adapters) {
    overrides.adapters = input.adapters;
  }
  if (input.providers) {
    overrides.providers = input.providers;
  }
  if (input.runtime) {
    overrides.runtime = input.runtime;
  }
  return overrides;
}

type AgentOverridesInput = {
  state: AgentRuntimeState;
  input: AgentRuntimeInput;
  overrides?: AgentRuntimeOverrides;
  useStreamingModel: boolean;
  eventStream?: EventStream;
  eventState?: AgentEventState;
  tools?: Tool[] | null;
};

function buildAgentOverrides(input: AgentOverridesInput): RecipeRunOverrides | null {
  const streamingModel = input.useStreamingModel
    ? buildStreamingModel(input.state, input.eventStream, input.eventState)
    : null;
  const adapters = buildAdapterOverrides({
    input: input.input,
    overrides: input.overrides,
    streamingModel: streamingModel ?? undefined,
    tools: input.tools ?? null,
  });
  return buildRecipeOverrides({
    adapters,
    providers: input.overrides?.providers,
    runtime: input.overrides?.runtime,
  });
}

type AgentRunContext = {
  state: AgentRuntimeState;
  input: AgentRuntimeInput;
  overrides?: AgentRuntimeOverrides;
  eventStream?: EventStream;
  eventState?: AgentEventState;
  interactionId: string;
  tools?: Tool[] | null;
  skillState?: MaybePromise<AgentSkillState> | AgentSkillState | null;
};

function resolveToolsForRun(input: {
  base?: Tool[] | null;
  overrides?: Tool[] | null;
  subagentTools?: Tool[] | null;
}) {
  const merged = mergeTools(input.base ?? null, input.overrides ?? null);
  return mergeTools(merged, input.subagentTools ?? null);
}

function resolveAdaptersForSkills(
  state: AgentRuntimeState,
  overrides?: AgentRuntimeOverrides,
): AdapterBundle | undefined {
  return mergeAdapterBundles(state.options.adapters, overrides?.adapters);
}

function createAgentRunContext(input: {
  state: AgentRuntimeState;
  input: AgentRuntimeInput;
  overrides?: AgentRuntimeOverrides;
}): AgentRunContext {
  const interactionId = readInteractionId(input.input, input.overrides);
  const eventStream = readEventStream(input.input, input.overrides);
  const correlationId = readCorrelationId(input.input, input.overrides, interactionId);
  const eventState = eventStream
    ? createAgentEventState({
        interactionId,
        correlationId,
        startSequence: readStartSequence(input.input.state),
      })
    : undefined;
  const subagentTools = createSubagentTools({
    factory: createAgentRuntime,
    runtimeOptions: buildSubagentRuntimeOptions(input.state.options),
    interactionId,
    eventStream,
    eventState,
    options: input.state.options.subagents,
  });
  const skillState = resolveAgentSkills({
    config: input.state.options.config,
    adapters: resolveAdaptersForSkills(input.state, input.overrides),
    state: input.input.state,
  });
  const tools = resolveToolsForRun({
    base: input.state.options.adapters?.tools ?? null,
    overrides: input.overrides?.adapters?.tools ?? null,
    subagentTools,
  });
  return {
    ...input,
    interactionId,
    eventStream,
    eventState,
    tools,
    skillState,
  };
}

type AgentOutcomeContext = {
  config?: AgentLoopConfig;
  eventStream?: EventStream;
  eventState?: AgentEventState;
  skills?: AgentLoopStateSnapshot["skills"];
  skillDiagnostics?: DiagnosticEntry[];
};

function appendSkillDiagnostics(
  outcome: Outcome<unknown>,
  diagnostics?: DiagnosticEntry[],
): Outcome<unknown> {
  if (!diagnostics || diagnostics.length === 0) {
    return outcome;
  }
  for (const entry of diagnostics) {
    addDiagnostic({ diagnostics: outcome.diagnostics }, entry);
  }
  return outcome;
}

function applyAgentOutcomeUpdates(input: AgentOutcomeContext, outcome: Outcome<unknown>) {
  const next = appendSkillDiagnostics(
    validateAgentSelection({ config: input.config, outcome }),
    input.skillDiagnostics,
  );
  return appendAgentLoopSnapshot({
    config: input.config,
    skills: input.skills,
    outcome: next,
  });
}

function emitAgentOutcomeEvents(input: AgentOutcomeContext, outcome: Outcome<unknown>) {
  return emitAgentLoopEvents({
    outcome,
    config: input.config,
    eventStream: input.eventStream,
    eventState: input.eventState,
  });
}

function applyAgentOutcome(input: AgentOutcomeContext, outcome: Outcome<unknown>) {
  return maybeTap(
    bindFirst(emitAgentOutcomeEvents, input),
    applyAgentOutcomeUpdates(input, outcome),
  );
}

type ApplyAgentOutcomeWithSkillsInput = {
  context: AgentOutcomeContext;
  outcome: Outcome<unknown>;
};

function mergeSkillContext(
  context: AgentOutcomeContext,
  skillState: AgentSkillState | null,
): AgentOutcomeContext {
  if (!skillState) {
    return context;
  }
  return {
    ...context,
    skills: skillState.skills,
    skillDiagnostics: skillState.diagnostics,
  };
}

function applyAgentOutcomeWithSkillState(
  input: ApplyAgentOutcomeWithSkillsInput,
  skillState: AgentSkillState | null,
) {
  return applyAgentOutcome(mergeSkillContext(input.context, skillState), input.outcome);
}

function applyAgentOutcomeWithSkills(
  input: {
    context: AgentOutcomeContext;
    skillState?: MaybePromise<AgentSkillState> | AgentSkillState | null;
  },
  outcome: Outcome<unknown>,
) {
  if (!input.skillState) {
    return applyAgentOutcome(input.context, outcome);
  }
  return maybeChain(
    bindFirst(applyAgentOutcomeWithSkillState, { context: input.context, outcome }),
    input.skillState,
  );
}

function runAgentRuntime(
  state: AgentRuntimeState,
  input: AgentRuntimeInput,
  overrides?: AgentRuntimeOverrides,
): MaybePromise<Outcome<unknown>> {
  const runContext = createAgentRunContext({ state, input, overrides });
  const runInput = inputs.agent(toAgentInputOptions(input));
  const resolved = buildAgentOverrides({
    state,
    input,
    overrides,
    useStreamingModel: false,
    eventStream: runContext.eventStream,
    eventState: runContext.eventState,
    tools: runContext.tools,
  });
  const outcome = resolved ? state.runner.run(runInput, resolved) : state.runner.run(runInput);
  return maybeChain(
    bindFirst(applyAgentOutcomeWithSkills, {
      context: {
        config: state.options.config,
        eventStream: runContext.eventStream,
        eventState: runContext.eventState,
      },
      skillState: runContext.skillState,
    }),
    outcome,
  );
}

function streamAgentRuntime(
  state: AgentRuntimeState,
  input: AgentRuntimeInput,
  overrides?: AgentRuntimeOverrides,
): MaybePromise<Outcome<unknown>> {
  const runContext = createAgentRunContext({ state, input, overrides });
  const runInput = inputs.agent(toAgentInputOptions(input));
  const resolved = buildAgentOverrides({
    state,
    input,
    overrides,
    useStreamingModel: true,
    eventStream: runContext.eventStream,
    eventState: runContext.eventState,
    tools: runContext.tools,
  });
  const outcome = resolved ? state.runner.run(runInput, resolved) : state.runner.run(runInput);
  return maybeChain(
    bindFirst(applyAgentOutcomeWithSkills, {
      context: {
        config: state.options.config,
        eventStream: runContext.eventStream,
        eventState: runContext.eventState,
      },
      skillState: runContext.skillState,
    }),
    outcome,
  );
}

export function createAgentRuntime(options: AgentRuntimeOptions): AgentRuntime {
  const state = createAgentRuntimeState(options);
  return {
    run: bindFirst(runAgentRuntime, state),
    stream: bindFirst(streamAgentRuntime, state),
  };
}
