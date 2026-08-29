# Public Language and Ownership Review

Architecture version: v2
Status: corrected by ADR-016
Decisions:
[`ADR-011`](decisions/ADR-011-accessible-public-language.md),
[`ADR-012`](decisions/ADR-012-exact-public-vocabulary.md) and
[`ADR-016`](decisions/ADR-016-integration-owned-execution.md)

## Outcome

`llm-core` uses ordinary language for portable contracts without presenting
itself as an agent SDK, workflow engine or conversation runtime.

The common kernel journey is:

```text
define portable intent
  -> import or reconcile specifications
  -> review and bind authority
  -> compile through an explicit integration target
  -> retain evidence, provenance and exact operation dispositions
```

Execution is always visibly owned by a qualified runtime integration. There is
no common `createAgent(...).run(...)`, `defineWorkflow(...).run(...)` or
`createConversation(...).send(...)` path backed by a hidden local executor.

## Why the correction was required

ADR-011 correctly identified that internal lifecycle terminology had escaped
into ordinary use. ADR-012 attempted to repair that usability problem with
ready-to-run Agent, Workflow and Conversation facades. The implementation then
made `createAgent` construct `createLocalAgentRunner`, even though ADR-012 said
the local runner was not its implementation.

That was not merely a naming simplification. It reassigned execution from
runtime integrations to the kernel and revived the pre-v2 recipe product.
ADR-016 therefore removes the runnable facades rather than renaming them again.

## Three language levels

| Level       | Audience                              | Examples                                                                                         |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Common      | Application and delivery authors      | specification, agent definition, tool definition, workflow intent, requirement, evidence, result |
| Integration | Runtime and adapter authors           | runner, prepare, checkpoint, native session, capability profile, operation disposition           |
| Internal    | Kernel implementation and conformance | registration token, authority snapshot, binding provenance, local proof runner, fake runner      |

Common language describes intent and evidence. It does not promise that a
common object is executable.

## Naming rules

1. Start with the user-owned intent or artifact, not an internal lifecycle.
2. Use `Definition` or `Spec` for portable declared behavior.
3. Use `Runner` only for the port implemented by a concrete runtime
   integration.
4. Use `Run`, `Result` and `Event` for normalized execution facts produced by a
   runtime integration.
5. Use `Workflow` for portable workflow intent only when the type cannot be
   mistaken for a kernel-owned workflow engine.
6. Use `Conversation` for portable conversational identity, state or events;
   execution and provider continuity remain runtime-owned.
7. Use `Adapter` for translation and `Target` for explicit compilation.
8. Keep native graphs, sessions, checkpoints and workspaces visibly native.
9. Use `Approval` only for an authenticated human decision and `Policy` for a
   machine-evaluated rule.
10. Do not make convenience erase ownership. If an operation executes, its
    concrete integration must be explicit in construction or import.

## Supported public journeys

### Portable agent intent

```ts
import type { AgentDefinition } from "@geekist/llm-core/agent";

const definition: AgentDefinition = {
  // portable identity, requirements and declared behavior
};
```

The exact definition schema remains governed by its feature contract. This
example establishes ownership, not a second handwritten shape.

### Tool definition

```ts
const search = defineTool({
  name: "search",
  description: "Search the knowledge base.",
  input: searchInput,
  effect: "read-only",
  execute: async ({ query }) => knowledge.search(query),
});
```

Tools may be portable declarations or host bindings. A runtime adapter decides
how its native runtime receives them; controlled effects still pass through the
kernel policy, authority, receipt and evidence contracts.

### Specification compilation

```ts
const specification = await loadSpecification(source);
const review = await reviewSpecification(specification, { policy, evidence });

if (review.status === "accepted") {
  const compiled = await compileSpecification(review, {
    target: langGraphTarget,
  });

  await langGraphRunner.run(compiled, input);
}
```

`langGraphTarget` and `langGraphRunner` are illustrative values supplied by a
qualified integration. Import is not authorization, and compilation does not
silently execute anything.

### Runtime integration

```ts
import type { AgentRunner } from "@geekist/llm-core/agent/runtime";
import { createLangGraphRunner } from "@geekist/llm-core/adapters/langgraph-runtime";

const runner: AgentRunner = createLangGraphRunner(nativeGraph, controls);
```

The adapter subpath exists only after exact-version qualification and
publication. The kernel does not provide a fallback runner.

## AIFSD product language

The complete AI-first delivery journey belongs to AIFSD. It covers
understanding, specification, implementation, independent review, evaluation,
approval, evidence and release. AIFSD composes kernel contracts with delivery
integrations such as OpenSpec, Codex, Claude or OpenHands. It is not a
`llm-core` runtime.

The supported AIFSD package currently exposes only `@aifsd/sdk/config` and
`@aifsd/sdk/integrations`. Application composition and client presentation are
planned surfaces. This language decision does not claim they ship.

The second journey is agentic behavior inside the delivered product. It uses a
qualified native runtime integration and shares the kernel's contracts,
authority and evidence vocabulary with the delivery journey.

## Superseded language

The following are retained only in git history and ADR-012's historical record:

- common `createAgent` returning a ready local Agent;
- common `defineWorkflow` returning a locally executable Workflow;
- common `createConversation` bound to that Agent;
- built-in target-neutral `ExecutionPlan` as the privileged path from
  specifications to execution; and
- `createLocalAgentRunner` as a supported package export.

No aliases or deprecation bridges are added because the project has no
compatibility obligation for these pre-user surfaces.
