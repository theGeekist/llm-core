import type { AdapterBundle, EventStream, Model, Tool } from "#adapters/types";
import type { MaybePromise } from "#shared/maybe";
import { maybeChain } from "#shared/maybe";
import { bindFirst } from "#shared/fp";
import type { Outcome, Runtime } from "#workflow/types";
import { createStreamingModelForInteraction } from "#workflow/stream";
import type { AgentInputOptions } from "#recipes/inputs";
import { inputs } from "#recipes/inputs";
import type { AnyRecipeHandle, RecipeRunOverrides } from "#recipes/handle";
import { recipes } from "#recipes";
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
import { createRecipeDiagnostic } from "#shared/diagnostics";
import {
  applyAgentPrompt,
  filterAgentTools,
  readMissingAgentTools,
  resolveAgentExecutionProfile,
  type AgentExecutionProfile,
} from "./agent-profile";

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
};

export type AgentRuntime = {
  run: (
    input: AgentRuntimeInput,
    overrides?: AgentRuntimeOverrides,
  ) => MaybePromise<Outcome<unknown>>;
};

type AgentRuntimeState = {
  options: AgentRuntimeOptions;
  profile: AgentExecutionProfile;
  handle: AnyRecipeHandle;
};

function createAgentRuntimeState(options: AgentRuntimeOptions): AgentRuntimeState {
  const adapters = { ...(options.adapters ?? {}), model: options.model };
  return {
    options,
    profile: resolveAgentExecutionProfile(options.config),
    handle: recipes.agent().defaults({ adapters }),
  };
}

function toAgentInputOptions(
  profile: AgentExecutionProfile,
  input: AgentRuntimeInput,
): AgentInputOptions {
  return {
    text: input.text,
    context: applyAgentPrompt(profile, input.context),
    threadId: input.threadId,
  };
}

const readEventStream = (input: AgentRuntimeInput): EventStream | undefined => input.eventStream;

const readInteractionId = (input: AgentRuntimeInput): string =>
  input.interactionId ?? input.threadId ?? "agent-loop";

function readCorrelationId(input: AgentRuntimeInput, interactionId: string): string {
  return input.correlationId ?? interactionId;
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

const mergeObjects = <T extends object>(base?: T, next?: T): T | undefined =>
  base && next ? { ...base, ...next } : (base ?? next);

type AdapterOverrideInput = {
  overrides?: AgentRuntimeOverrides;
  eventStream?: EventStream;
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
  const additions: AdapterBundle = {};
  if (input.streamingModel) {
    additions.model = input.streamingModel;
  }
  if (input.eventStream) {
    additions.eventStream = input.eventStream;
  }
  if (input.tools) {
    additions.tools = input.tools;
  }
  const additionsEmpty = !additions.model && !additions.eventStream && !additions.tools;
  if (additionsEmpty) {
    return input.overrides?.adapters;
  }
  return mergeObjects(input.overrides?.adapters, additions);
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
  overrides?: AgentRuntimeOverrides;
  eventStream?: EventStream;
  eventState?: AgentEventState;
  tools?: Tool[] | null;
};

function buildAgentOverrides(input: AgentOverridesInput): RecipeRunOverrides | null {
  const streamingModel = buildStreamingModel(input.state, input.eventStream, input.eventState);
  const adapters = buildAdapterOverrides({
    overrides: input.overrides,
    eventStream: input.eventStream,
    streamingModel: streamingModel ?? undefined,
    tools: input.tools ?? null,
  });
  return buildRecipeOverrides({
    adapters,
    providers: mergeObjects(input.state.options.providers, input.overrides?.providers),
    runtime: mergeObjects(input.state.options.runtime, input.overrides?.runtime),
  });
}

type AgentRunContext = {
  state: AgentRuntimeState;
  input: AgentRuntimeInput;
  overrides?: AgentRuntimeOverrides;
  eventStream?: EventStream;
  eventState?: AgentEventState;
  interactionId: string;
  profile: AgentExecutionProfile;
  snapshotToolAllowlist?: string[] | null;
  missingTools: string[];
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
  return mergeObjects(state.options.adapters, overrides?.adapters);
}

function createAgentRunContext(input: {
  state: AgentRuntimeState;
  input: AgentRuntimeInput;
  overrides?: AgentRuntimeOverrides;
}): AgentRunContext {
  const interactionId = readInteractionId(input.input);
  const eventStream = readEventStream(input.input);
  const correlationId = readCorrelationId(input.input, interactionId);
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
  const profile = input.state.profile;
  const availableTools = resolveToolsForRun({
    base: input.state.options.adapters?.tools ?? null,
    overrides: input.overrides?.adapters?.tools ?? null,
    subagentTools,
  });
  const tools = filterAgentTools(profile, availableTools);
  const hasToolPolicy = profile.toolAllowlist !== null || profile.toolDenylist.length > 0;
  return {
    ...input,
    interactionId,
    eventStream,
    eventState,
    profile,
    snapshotToolAllowlist: hasToolPolicy ? (tools ?? []).map((tool) => tool.name) : null,
    missingTools: readMissingAgentTools(profile, availableTools),
    tools,
    skillState,
  };
}

type AgentOutcomeContext = {
  config?: AgentLoopConfig;
  profile: AgentExecutionProfile;
  toolAllowlist?: string[] | null;
  missingTools?: string[];
  eventStream?: EventStream;
  eventState?: AgentEventState;
  skills?: AgentLoopStateSnapshot["skills"];
  skillDiagnostics?: DiagnosticEntry[];
};

function appendMissingToolDiagnostic(input: AgentOutcomeContext, outcome: Outcome<unknown>) {
  if (!input.missingTools || input.missingTools.length === 0) {
    return outcome;
  }
  addDiagnostic(
    { diagnostics: outcome.diagnostics },
    createRecipeDiagnostic("Configured agent tools are not available.", {
      tools: input.missingTools,
    }),
  );
  return outcome;
}

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
  appendMissingToolDiagnostic(input, next);
  return appendAgentLoopSnapshot({
    config: input.config,
    profile: input.profile,
    toolAllowlist: input.toolAllowlist,
    skills: input.skills,
    outcome: next,
  });
}

function emitAgentOutcomeEvents(input: AgentOutcomeContext, outcome: Outcome<unknown>) {
  return emitAgentLoopEvents({
    outcome,
    config: input.config,
    profile: input.profile,
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

function executeAgentRuntime(
  state: AgentRuntimeState,
  input: AgentRuntimeInput,
  overrides?: AgentRuntimeOverrides,
): MaybePromise<Outcome<unknown>> {
  const runContext = createAgentRunContext({ state, input, overrides });
  const runInput = inputs.agent(toAgentInputOptions(runContext.profile, input));
  const resolved = buildAgentOverrides({
    state,
    overrides,
    eventStream: runContext.eventStream,
    eventState: runContext.eventState,
    tools: runContext.tools,
  });
  const outcome = resolved ? state.handle.run(runInput, resolved) : state.handle.run(runInput);
  return maybeChain(
    bindFirst(applyAgentOutcomeWithSkills, {
      context: {
        config: state.options.config,
        profile: runContext.profile,
        toolAllowlist: runContext.snapshotToolAllowlist,
        missingTools: runContext.missingTools,
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
    run: bindFirst(executeAgentRuntime, state),
  };
}
