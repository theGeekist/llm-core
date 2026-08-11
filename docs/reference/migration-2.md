# Migration to the ADR-016 boundary

Architecture v2 originally published ready-to-run Agent, Workflow, and Conversation facades. ADR-016 removes them because they silently assigned execution to a local kernel implementation.

The project is pre-user and does not provide compatibility aliases.

## Agent execution

Replace root `createAgent` and public `createLocalAgentRunner` usage with an explicit qualified runtime adapter implementing `AgentRunner`:

```ts
import type { AgentDefinition, AgentRunner } from "@geekist/llm-core/agent/runtime";

declare const runner: AgentRunner;
declare const definition: AgentDefinition;

const prepared = await runner.prepare(definition);
```

The concrete adapter import depends on the exact runtime support published by the package. There is no fallback implementation.

## Workflow execution

Replace `defineWorkflow(...).run(...)` with portable workflow intent compiled or projected by the selected runtime integration. Native branching, reducers, interrupts, checkpoints, and scheduling remain owned by that runtime.

The former `./workflow/runtime` subpath is removed. Controlled-resume machinery remains internal conformance and security infrastructure until a qualified runtime integration exposes the matching behavior.

## Conversations

Replace `createConversation({ agent, store })` with an application-owned API or an explicit `InteractionSession`. The session requires a prepared definition and injected `AgentRunner`; it never chooses a runtime.

## Specifications

`loadSpecification`, `reviewSpecification`, `projectSpecification`, and `compileSpecification` remain. Replace the built-in Agent `ExecutionPlan` gateway with an explicit compiler target supplied by a delivery or runtime integration.

Conversion fidelity reports are removed. Every adapter declaration now contains the closed matrix `observe-native-source`, `derive-portable-specification`, `compile-portable-specification`, `export-native-source`, and `round-trip-native-source` in that order. Each operation is `supported`, `unsupported`, or `not-applicable`, and its authority, format and revision exactly match the containing declaration. Diagnostics never turn a narrowed result into supported conversion. Native source snapshots remain available separately from portable derivations. PydanticAI compilation rejects requested skills, model requirements, dependency schema, output schema or any other semantics that its qualified AgentSpec operation cannot preserve exactly.

## Local proof code

The TypeScript local runner remains in internal tests only. Applications and adapters must not import internal source paths to regain it. A supported runner requires its own adapter subpath, exact-version fixture, conformance evidence, maintenance owner, and publication decision.
