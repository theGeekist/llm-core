# Recipe: Eval (Generate + Score)

> [!NOTE] > Goal: Compare candidate outputs, score them, and keep a transparent evaluation trail.

Eval is the recipe you reach for when you need repeatable scoring and explicit winner selection. It takes a
prompt and produces candidates, then scores them into a report. The important part is not the scoring logic
(it can be simple or complex), but the fact that the evaluation is deterministic, visible, and tied to
runtime diagnostics and trace so you can explain why one output won.

This recipe is useful for rubric‑style grading, answer selection, regression tests, and dataset audits.
It keeps evaluation mechanics separate from generation, which makes it easy to swap models or scorer
adapters without rewriting your glue code.

```mermaid
flowchart LR
  Input([Prompt]) --> Generate[Generate candidates]
  Generate --> Score[Score + select]
  Score --> Output([Winner + report])
```

---

## 1) Quick start (prompt + candidates)

Eval expects a prompt and optional dataset rows. Each run returns `{ status, artefact, diagnostics, trace }`.
On **ok**, the artefact includes `eval.candidates`, `eval.scores`, `eval.winner`, and `eval.report`, plus
`dataset.rows` if you passed dataset context. **paused** and **error** outcomes keep diagnostics and trace
attached so you never lose the evaluation trail.

::: tabs
== JavaScript

<<< @/snippets/recipes/eval/quick-start.js#docs

== TypeScript

<<< @/snippets/recipes/eval/quick-start.ts#docs

:::

Related: [Runtime Outcomes](/reference/runtime#outcomes), [Recipes API](/reference/recipes-api), and
[Adapters overview](/adapters/).

---

## 2) Configure per-recipe defaults (typed)

Eval exposes a small configuration surface (for example, candidate count). Use `configure()` for
recipe‑specific behaviour and `defaults()` for adapter wiring. The config is **recipe‑scoped** and typed;
there is no global, catch‑all recipe config.

::: tabs
== JavaScript

<<< @/snippets/recipes/eval/defaults.js#docs

== TypeScript

<<< @/snippets/recipes/eval/defaults.ts#docs

:::

---

## 3) Diagnostics + trace

Eval always returns diagnostics and trace. Strict mode is the simplest way to turn missing dependencies
into errors instead of warnings. That is especially useful for evaluation: you want to fail fast when the
run is missing a scorer or a required adapter.

<<< @/snippets/recipes/eval/diagnostics.js#docs

Read more: [Runtime -> Diagnostics](/reference/runtime#diagnostics) and
[Runtime -> Trace](/reference/runtime#trace).

---

## 4) Composition + plan

Eval is a leaf recipe that composes cleanly with others. You can plug it into a larger flow to add scoring
after generation or retrieval, and inspect the plan to make the step order explicit.

```mermaid
flowchart LR
  Seed[eval.seed] --> Generate[eval.generate]
  Generate --> Score[eval.score]
```

<<< @/snippets/recipes/eval/composition.js#docs

---

## 5) Why Eval is special

Eval makes scoring a first‑class, observable step rather than a hidden, ad‑hoc utility. It is a deliberate
boundary: generation can evolve independently, but the evaluation surface stays stable so reports remain
comparable across providers and across time.

---

## Implementation

- Source: [`src/recipes/eval/index.ts`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/eval/index.ts)
