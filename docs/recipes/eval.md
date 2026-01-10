# Recipe: Eval (Generate + Score)

> [!NOTE] > Goal: Compare candidate outputs, score them, and keep a transparent evaluation trail.

Eval is the recipe you reach for when you want repeatable scoring and a clear winner for each run. It takes a
prompt, produces one or more candidates, then scores them into a report. The main focus is the evaluation
itself. The scoring rules can stay simple or grow quite involved over time; the important detail is that every
evaluation stays deterministic, visible, and tied to runtime diagnostics and trace so you can explain why one
output won.

This recipe fits rubric‑style grading, answer selection, regression tests, and dataset audits. Generation and
evaluation live in separate stages, which makes it easy to swap models or scorer adapters and keep the
evaluation surface stable.

```mermaid
flowchart LR
  Input([Prompt]) --> Generate[Generate candidates]
  Generate --> Score[Score + select]
  Score --> Output([Winner + report])
```

---

## 1) Quick start (prompt + candidates)

Eval expects a prompt and optional dataset rows. Each run returns an outcome object with
`{ status, artefact, diagnostics, trace }`. When the outcome is **ok**, the artefact includes `eval.candidates`,
`eval.scores`, `eval.winner`, and `eval.report`, together with `dataset.rows` when you pass dataset context.
Outcomes with **paused** or **error** status still carry diagnostics and trace so the evaluation trail stays
available.

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

Eval exposes a small configuration surface, for example the number of candidates to generate per prompt. Use
`configure()` for recipe‑specific behaviour and `defaults()` for adapter wiring. The config is recipe‑scoped
and typed, so every recipe declares its own shape instead of sharing a global, catch‑all object.

In practice this means you can tighten or relax evaluation rules, adjust scoring, or tune candidate counts
without changing how the rest of the workflow calls the recipe.

::: tabs
== JavaScript

<<< @/snippets/recipes/eval/defaults.js#docs

== TypeScript

<<< @/snippets/recipes/eval/defaults.ts#docs

:::

---

## 3) Diagnostics + trace

Eval always returns diagnostics and trace alongside the artefact. Strict mode offers the simplest way to
promote missing dependencies to errors instead of warnings. That pattern suits evaluation workflows very well,
because a missing scorer or adapter behaves like a failed test rather than a silent misconfiguration.

<<< @/snippets/recipes/eval/diagnostics.js#docs

Read more: [Runtime -> Diagnostics](/reference/runtime#diagnostics) and
[Runtime -> Trace](/reference/runtime#trace).

---

## 4) Composition + explain

Eval works as a leaf recipe that composes cleanly with others. You can plug it into a larger flow to add
scoring after generation or retrieval, then inspect the explain output to see the step order and inputs.

```mermaid
flowchart LR
  Seed[eval.seed] --> Generate[eval.generate]
  Generate --> Score[eval.score]
```

<<< @/snippets/recipes/eval/composition.js#docs

This layout keeps the evaluation steps explicit: a seed step that prepares inputs, a generate step that
produces candidates, and a score step that applies the rubric and selects a winner.

---

## 5) Why Eval is special

Eval treats scoring as a first‑class, observable step rather than a hidden, ad‑hoc utility. This creates a
deliberate boundary in your workflows. Generation can evolve independently across models and providers, while
the evaluation surface stays stable so reports remain comparable across providers and across time.

Eval also encourages teams to encode their review habits into code. Rubrics, acceptance criteria, and dataset
checks become repeatable runs instead of one‑off scripts or manual reviews. Over time you gain a history of
evaluation runs that explain how quality changed as you tuned prompts, swapped models, or refined datasets.

---

## Implementation

- Source: [`src/recipes/eval/index.ts`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/eval/index.ts)
