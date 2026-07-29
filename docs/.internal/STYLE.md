# Docs voice contract (v2)

The v1 docs read well. The prose is not the problem; the drift is. Pages still
describe the old nouns (Recipes, Packs, `artefact`, Outcome, "Adapters are
Plugs") while the architecture has moved to new ones. v2 keeps the v1 voice and
retells it with the ratified vocabulary.

**Learn the voice from the existing pages.** `docs/guide/philosophy.md` and
`docs/guide/core-concepts.md` are the reference. Before writing, read them and
match their register.

Authoring runs through the `doc-coauthoring` or `engineering:documentation`
skill. This file is what those skills check against.

## The voice, from the existing docs

- **Explain by walking the reader through it.** philosophy.md opens with the pain
  as a story: "you start with a script. You call `openai.chat.completions.create`,
  you parse a bit of JSON..." Concrete, second person, sequential.
- **Analogies earn their place, then stop.** "Adapters act as ports; plugins are
  the appliances that plug in." "Frontend once relied on jQuery... then moved to
  component trees." One clear analogy per idea, dropped once it has landed.
- **Structure with tables and short lists**, like the Outcome status table. Reach
  for a table whenever you are comparing states or options.
- **Declarative, calm sentences.** Statements of fact, not exclamation. The tone
  trusts the reader to see why something matters.
- **Show the smallest real snippet** and label the phases in comments
  (`// 1. Authoring`, `// 2. Compiling`, `// 3. Execution`).

## Two habits to drop (recent feedback)

1. **No em-dash spray.** The existing docs barely use them; use periods, commas,
   colons, or parentheses. En dash only for numeric ranges (`Node 20–22`).
2. **Frame affirmatively.** Say what holds, not what is forbidden. Avoid the
   rhetorical "never X, never Y". "Provider types stay behind the adapter" beats
   "provider types never cross the adapter". A named failure mode may still state
   its constraint plainly ("effects fail closed").

## Keep internal cadence out of published pages

Published docs speak to a reader adopting the library. They never expose how the
project is built. Keep the following out of any page under `docs/` (they belong
here in `.internal/`, in commit messages, or in the arch program files):

- **Program and process language:** waves, slices, "front by front",
  "converge", roadmap and status notes ("v2 is in progress"), task IDs
  (`P0-xxx`), ADR numbers, worktrees, swarm/coordinator, "pre-compatibility
  posture".
- **Repo internals:** links into `packages/**/internal/**`, branch names
  (`docs-1.x`), and links to these meta-docs.
- **Our private jargon:** "public front", "feature front", "narrow waist" as
  bare labels. Say the user-facing thing instead: a capability, a subpath
  export, a stable contract.

Write in the present tense about what the library does today. Version and
migration notes are fine when framed for the reader ("Coming from 1.x, X is now
Y"), without the delivery mechanics behind them.

## The one substantive change from v1: the nouns

This is the whole point of v2, and it is where the first draft went wrong. The
concepts are NOT interchangeable. Several of them are explicitly retained by the
research assessment and ADR-002/ADR-006; do not collapse them into a single noun.

**The mental model, in one line:** Specs describe agents. Recipes package
workflows. Runners execute agent runs. Workflows orchestrate steps. Interactions
project events into UI state. Capabilities define ports; adapters plug into them.

Renames (direct replacements, no aliases):

| v1 / current | v2 | Meaning |
|---|---|---|
| `AgentDefinition` | `AgentSpec` | Portable declarative agent config: model, tools, policy. |
| `AgentRuntime` | `AgentRunner` | The executable port. Local impl is `createLocalAgentRunner`. |
| `AgentRuntimeInput` | `AgentRunRequest` | Input to one run. |
| `EventStream` | `EventSink` | The `emit` surface, not an iterable. |
| `TraceEvent` (as history) | `ExecutionEvent` | Reserve trace/span for observability. |
| `artefact` | `artifact` / `Artifact` | American spelling in code and serialized fields. |
| `Pack` | `RecipeModule` / `StepGroup`, or drop from public | Weakest noun; qualify or remove. |

Retained, with distinct meanings (never merge these):

| Noun | Meaning | Do not confuse with |
|---|---|---|
| `AgentSpec` | Description of a probabilistic agent. | Not a Recipe, not a Workflow. |
| `Recipe` | Reusable, preconfigured **Workflow** composition. | Not an `AgentSpec`. Document how it differs from Workflow and a template. |
| `Workflow` | Explicit application orchestration of steps. | Not the probabilistic agent loop. |
| `Step` | Author-defined unit in a workflow. | Not a runtime `Task`. |
| `Outcome<T>` | Workflow execution union: `ok \| paused \| error`. | Not `RunResult`. |
| `AgentRun` | The live handle for one agent run: events + typed controls. | Not a terminal value. |
| `RunResult` | The one terminal result of an `AgentRun`: `completed \| failed \| denied \| cancelled`. | Not `Outcome`; `paused` is not one of its states. |

Suspension is a control, not a terminal result: a run pauses via an
`InterventionRequest` and hands back a `ResumableCheckpoint`, then continues via
a `ResumeStrategy`. Qualify bare nouns (`Context`, `State`, `Memory`, `Task`,
`Runtime`, `Profile`, `Result`, `Thread`) into their ratified forms.

## Gate code against real exports, not the plan

Conceptual prose may use the ratified nouns now (the ADRs are accepted). Code
examples and lifecycle claims may not run ahead of the shipped surface. Before
writing any import or function name, check `packages/llm-core/package.json`
`exports`. Today that surface is `/`, `/workflow`, `/recipes`, `/interaction`,
`/functional`, `/diagnostics`, and `/adapters/*`. Subpaths like `/agent`,
`/model`, `/control`, `/evidence`, and `/state` do not exist yet; do not import
them in a published page. A page that needs an unshipped API stays conceptual
(or draft-marked) until its slice exports.

## Pre-publish checklist

- [ ] Reads like philosophy.md / core-concepts.md (register matches).
- [ ] Nouns are the ratified v2 forms; no stale Recipe/Pack/`artefact`.
- [ ] Imports are real public subpath fronts.
- [ ] No em-dash spray; affirmative framing.
- [ ] At least one small snippet, and any guarantee links to the page that shows it.
