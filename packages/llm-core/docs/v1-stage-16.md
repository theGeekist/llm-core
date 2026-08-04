# Stage 16 — Runtime Policy + Legacy Port (llm-core)

Purpose: adopt the legacy llm-core building blocks without reviving the old pipeline, and make retry a first-class runtime policy aligned with DAG pause/resume, diagnostics, and determinism.

This stage assumes the current workflow runtime + adapter registry are the execution surface and treats the old repo as a parts bin.

## Goals

- Establish a first-class retry policy with deterministic resolution and adapter-safe fallbacks.
- Port semantic chunking + markdown splitting into primitive TextSplitter factories.
- Port structured prompt schemas as recipe-level helpers, not adapters.
- Keep pause/resume and rollback conventions intact; no new pipeline abstractions.

## Imports (from legacy llm-core)

- Cosine semantic chunker (cosine distance thresholding, overlap, buffer/window options).
- Markdown splitter (heading-aware segmentation, min/max chunk bounds).
- Similarity-greedy clustering (cosine matrix + row-threshold grouping).
- Classification service (zero-shot classification).
- Prompt schemas + structured prompt helpers (news extraction, article counting, Q synthesis, answer/snippet/directive prompts).
- JSON schema shapes for structured outputs.

Non-imports:

- Old pipeline runner and helpers (retries/timeout wrappers, pipeline pause semantics).
- Old OpenAI/Ollama service wrappers (behavior moves into adapters + runtime policy).

## Layer Mapping

- Runtime: retry policy resolution + adapter call wrapping + pause behavior.
- Adapters: metadata constraints for retry safety; no policy defaults beyond opt-in constraints.
- Recipes: prompt helpers + schema usage; example recipe(s) that demonstrate structured outputs.
- Primitives: text splitter implementations that conform to `TextSplitter`.
  - Similarity-greedy becomes a recipe (uses embedder + cosine similarity helpers).
  - Classification becomes a new adapter construct (see classification section).

## Plan

1. Runtime retry policy types and resolution order. Status: pending.
2. Adapter metadata gates for retry safety and streaming behavior. Status: pending.
3. Adapter call wrappers with retry + trace + diagnostics. Status: pending.
4. Pause-on-exhaustion semantics integrated with interrupt/rollback. Status: pending.
5. Text splitter primitives: markdown + cosine splitters. Status: pending.
6. Text splitter exports + ingest integration tests. Status: pending.
7. Similarity-greedy recipe (cosine clusterer) with tests. Status: pending.
8. Classification construct + adapter shape + diagnostics. Status: pending.
9. Prompt schema library under recipes with structured-output helpers. Status: pending.
10. One recipe that consumes a structured prompt schema. Status: pending.
11. OpenAI batch recipe design (modern API surface). Status: pending.
12. Documentation updates (stage notes, adapter docs, recipes docs). Status: pending.
13. Interop audit updates for new primitives/constructs. Status: pending.

## Implementation Details

- Retry policy should be per adapter-method class, not global.
- Resolution order: run overrides > recipe defaults > adapter metadata fallback > runtime default.
- Adapter metadata never vetoes or further constrains a runtime policy.
- Streaming retries default to off unless adapter metadata explicitly allows restartable streams.
- Retries should be internal by default; pause mode uses `pauseKind: "system"` only when enabled.
- Effectful adapters must still return `true | false | null`; retry wrappers must preserve that contract.

## Retry Policy Sketch

Type shape:

- RetryPolicy: `{ maxAttempts, backoffMs, maxBackoffMs?, jitter?, mode?, retryOn? }`
- RetryConfig: `{ model?, embedder?, retriever?, vectorStore?, loader?, kv?, cache?, memory? }`

Adapter metadata additions:

- `metadata.retry?: { allowed?: boolean; retryOn?: RetryReason[]; restartable?: boolean }`

Wrapper placement:

- `src/workflow/adapter-context.ts` wraps adapter methods with retry logic using resolved policy.

Trace + diagnostics:

- Emit `adapter.retry` events for attempts and `adapter.retry.exhausted` on failure.
- Add a single diagnostic entry for exhaustion; do not spam diagnostics per attempt.

## Text Splitter Primitives

- File location: `src/adapters/primitives/text-splitter/`.
- Factories:
  - `createMarkdownTextSplitter(options?)`
  - `createCosineTextSplitter({ embedder, options })`
- Cosine splitter closes over an `Embedder` adapter; no new adapter constructs.
- Expose in `src/adapters/index.ts`.

## Prompt Schema Library

- File location: `src/recipes/prompts/`.
- Export each prompt as `{ systemPrompt, userPrompt, responseSchema }`.
- Use existing `Schema` and `ModelCall.responseSchema` conventions.
- Avoid adapter-specific prompt helpers; keep prompts recipe-aligned.
- Prompt inventory to migrate (legacy `prompts.ts`):
  - news extraction (articles + image + description)
  - article count
  - single question synthesis
  - section question generation (release notes vs docs)
  - answer synthesis
  - snippet extraction
  - directive generation
  - transformation directive generation

## Similarity-greedy Recipe

- Based on legacy `similarity-greedy.ts` (cosine matrix + row-threshold clustering).
- Recipe should accept `texts` input and optional `threshold`.
- Uses embedder adapter + cosine helper; returns `clusters: string[][]` artefact.
- Keep deterministic ordering (greedy, order-sensitive).

## Classification Construct

- Add a new adapter construct (e.g., `classifier`) with a minimal interface:
  - `classify(items, context?) -> { item, category, score }[]`
  - optional `labels` metadata for declared categories
- Provide diagnostics for missing inputs and invalid responses.
- Implement adapter shims for at least one provider (TBD).

## OpenAI Batch (Modern API)

- Revisit OpenAI batch API directly (modern SDK + endpoints).
- Implement as a recipe (batch ingestion + polling) rather than reviving legacy pipeline.
- Preserve pause/resume semantics by mapping batch wait states to `pauseKind: "external"`.

## Caveats

- Retry must not implicitly re-run non-idempotent effects unless adapter metadata opts in.
- Pause-on-exhaustion must not occur if the recipe does not support resume.
- Text splitter must emit diagnostics for invalid input via `AdapterCallContext`.
- Keep modules under 500 SLOC; split helpers into small pure functions.
