# Recipe: HITL (Human-in-the-Loop Gate)

> [!NOTE] > **Goal**: Pause a workflow, wait for external input, then resume deterministically.

HITL is a reusable gate recipe. It returns a **paused** outcome until a decision arrives, then resumes
with that decision as input. You reach for it when you need explicit approvals, manual verification,
policy escalation, or long‑running external jobs (batch APIs, review queues) to finish before the
workflow can continue. Despite the name, it is a general pause gate — the “decision” can be human,
system, or schedule‑driven.

Typical uses include compliance review, risky tool execution, sensitive customer responses, and
batch jobs that finish hours later. It turns “we should pause here” into a deterministic, auditable
step rather than a one‑off hack.

```mermaid
flowchart LR
  Run([run]) --> Pause{decision?}
  Pause -- no --> Token[(pause token)]
  Token --> Resume([resume])
  Pause -- yes --> Done([complete])
```

---

## 1) Quick start (pause + resume)

::: tabs
== TypeScript

<<< @/snippets/recipes/hitl/quick-start.ts#docs

== JavaScript

<<< @/snippets/recipes/hitl/quick-start.js#docs

:::

Outcomes are explicit: `{ status, artefact, diagnostics, trace }`. When the gate pauses, you get a
token and a **partial artefact** snapshot, plus trace/diagnostics that explain why it paused. When you
resume, the decision input is threaded into the same execution context so the flow remains deterministic.
The artefact will include the draft decision payload and any intermediate outputs that were produced
before the gate paused, so you can render or review them without running the workflow again.

Related: [Runtime -> paused flow](/reference/runtime#paused-flow), [Runtime Outcomes](/reference/runtime#outcomes),
and [Recipes API](/reference/recipes-api).

---

## 2) What you’ll usually configure

Most teams keep the gate simple: a pause, a decision, and a resume. The two common configuration
choices are durability and strictness. If you need resume across process restarts, add a cache or
checkpoint adapter. If you want missing adapters or invalid tokens to fail hard, run with strict
diagnostics at runtime.

If you are building a UI, you can treat a paused outcome as a “review task” object: show the draft,
collect a decision, and resume with that decision payload.

---

## 3) Durable resume (cache / checkpoint)

By default, pause tokens are process-local. To resume across restarts, provide a cache or checkpoint adapter.

::: tabs
== TypeScript

<<< @/snippets/recipes/hitl/durable.ts#docs

== JavaScript

<<< @/snippets/recipes/hitl/durable.js#docs

:::

See: [Adapters -> Cache](/reference/adapters-api#cache-adapters-resume-persistence) and
[Runtime](/reference/runtime).

---

## 4) Diagnostics + trace

You can inspect pause events and reason about why the gate paused.

::: tabs
== TypeScript

<<< @/snippets/recipes/hitl/diagnostics.ts#docs

== JavaScript

<<< @/snippets/recipes/hitl/diagnostics.js#docs

:::

Diagnostics are the guardrails here: missing cache adapters, invalid tokens, or incompatible resume
inputs surface immediately in the outcome, and the trace shows exactly where the gate paused.

The mental model is intentionally simple: you always either complete or pause, and you always resume
with a token that was produced by that pause. There are no hidden states or implicit restarts.

---

## 5) Composition (use it as a gate)

Drop the gate into any recipe with `.use()`.

::: tabs
== TypeScript

<<< @/snippets/recipes/hitl/composition.ts#docs

== JavaScript

<<< @/snippets/recipes/hitl/composition.js#docs

:::

HITL is a checkpoint, not a transformer. You usually drop it into a larger flow — [Agent](/recipes/agent)
for tool approvals, [RAG](/recipes/rag) for high‑risk answers, or [Ingest](/recipes/ingest) when you need
manual validation before indexing.

If you want a quick rule of thumb: put HITL immediately before the action you cannot undo, and let
the gate’s outcome become the human‑visible artifact you approve or reject.

---

## 6) Why HITL is special

HITL is the only recipe whose primary output is a pause. That makes it the canonical example for
long‑wait workflows and deterministic resume semantics: explicit token, partial artefact snapshot,
and trace/diagnostics that never disappear. If you need a reliable “stop here and wait” primitive,
this is the one.

---

## Implementation

- Source: [`src/recipes/hitl/index.ts`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/hitl/index.ts)
