# Docs voice contract (v2)

The v2 docs explain the library that ships today. They keep the direct,
reader-centred voice of the original guides while using the final public
vocabulary and package surface.

## Voice

- Walk the reader through a concrete sequence. Use “you” when it helps the
  reader follow an action or decision.
- Prefer calm, declarative sentences. State what the library does and where a
  guarantee comes from.
- Let one analogy explain one idea, then return to the technical model.
- Use tables for states, comparisons, and exact mappings.
- Show the smallest real snippet. Put reusable TypeScript in
  `docs/snippets/v2/` and typecheck it.
- Use numbered phase comments when an example crosses authoring, composition,
  and execution.
- Use periods, commas, and parentheses instead of em-dash-heavy prose.
- Frame constraints affirmatively. A named failure mode may state its rule
  plainly: meaningful effects fail closed.

## Published voice

Published pages speak to someone adopting the package. Keep project mechanics
in `.internal/`:

- task IDs, architecture waves, branches, worktrees, agents, and review status;
- links into `packages/**/internal/**`;
- private labels such as “public front”, “feature front”, and “convergence”.

Use reader-facing terms such as capability, subpath export, stable contract,
and qualified adapter. Write in the present tense about the current release.

## Authoritative mental model

Specs describe agents. Runners prepare and execute agent runs. Workflows
orchestrate ordered steps. Interactions project canonical events into
deterministic state. Capabilities define ports, and qualified adapters connect
external systems to them.

| Noun                       | Meaning                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `AgentSpec`                | Portable agent intent: identity, version, instructions, effect requirement, metadata, and skills.   |
| `AgentRunner`              | Executable port that prepares a spec and starts a run. Resume is optional and capability-gated.     |
| `AgentRun`                 | Live handle exposing `AgentRunEvent` values, typed controls, and one terminal result.               |
| `RunResult`                | Terminal agent result: `completed`, `failed`, `denied`, or `cancelled`.                             |
| `WorkflowDefinition`       | Ordered, author-defined workflow steps.                                                             |
| `WorkflowExecutionOutcome` | Workflow result: `completed`, `paused`, or `failed`.                                                |
| `ExecutionEvent`           | Redacted evidence for the controlled tool-execution lifecycle. It is not an agent event or a trace. |
| `InteractionEvent`         | Closed event union reduced into interaction state.                                                  |
| `InvocationContext`        | Portable execution identity and authority passed separately from live ports.                        |
| `Artifact`                 | Portable output identity and provenance. Use American spelling in code and prose.                   |

`Recipe` may describe an application-level composition pattern, but it is not a
public llm-core type or package export. The v1 `Outcome` name is replaced by the
exact agent and workflow result types above.

Qualify overloaded nouns such as Context, State, Memory, Runtime, Profile,
Result, and Thread.

## Surface gate

Every import, function name, type, lifecycle claim, and runtime claim must match:

1. `packages/llm-core/package.json` exports;
2. the corresponding public TypeScript surface;
3. a typechecked snippet or test when code is shown.

The package is ESM-only and declares Node.js 22 or newer. Do not claim browser,
Edge, Deno, Bun, provider, framework, or second-runtime support without a
matching tested compatibility statement.

## Visuals

Use a diagram only when relationships or lifecycle state are clearer visually.
Prefer:

- flowcharts for dependency direction and provenance;
- sequence diagrams for agent runs, controlled effects, and interactions;
- state diagrams for workflow and checkpoint lifecycles;
- tables for vocabulary, exports, and migration mappings.

Keep node labels aligned with exported names. Every Mermaid diagram must build
through the docs pipeline.

## Pre-publish checklist

- [ ] The page follows this voice and uses current nouns.
- [ ] Imports resolve through published subpaths.
- [ ] Reusable TypeScript lives in the checked snippet library.
- [ ] Agent, evidence, and interaction event families remain distinct.
- [ ] Runtime and compatibility claims cite tested support.
- [ ] Links point to pages present in the same docs build.
- [ ] A visual is included only when it materially clarifies the subject.
