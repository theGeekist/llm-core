# Plan

Status: planned.

Stage 8 implements real adapters for each ecosystem using the Stage 7 contracts and parity tests.
This stage adds integration tests gated by environment to avoid CI breakage.

## Requirements

- Implement adapter modules per ecosystem (LangChain, LlamaIndex, AI SDK).
- Keep adapter code isolated from core workflow runtime.
- Wire adapters into lifecycle helpers without widening public API.
- Resume should run through pipeline with adapters once a HITL adapter exists.
- Add workflow-side primitives to support adapters (context accessors, capability checks, adapter validation).
- Env-gated integration tests (Ollama daemon, API keys).

## Scope

- In: adapter implementations, integration tests, runtime wiring for adapters/resume.
- Out: new recipes or changes to core pipeline semantics.

## Files and entry points

- src/adapters/\*
- src/workflow/\*
- tests/interop/\*
- tests/integration/\*
- docs/implementation-plan.md

## Action items

[ ] Implement LangChain adapters (tools, prompts, retrievers, embeddings, splitters).
[ ] Implement LlamaIndex adapters (retriever, embedder, node parsers, memory).
[ ] Implement AI SDK adapters (model calls, tools, embeddings).
[ ] Add workflow helpers: adapter-aware context accessors, capability predicates, adapter validation.
[ ] Add integration tests gated by env vars (OLLAMA_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY).
[ ] Thread adapters into resume pipeline path when HITL adapter exists.
[ ] Keep parity/shape tests green; add integration-only suites separately.

## Testing and validation

- bun run lint
- bun run typecheck
- bun test
- bun test tests/integration --env OLLAMA_URL=...

## Risks and edge cases

- Adapter drift with upstream ecosystem changes.
- Env-gated tests require clear defaults and skip behavior.
- Avoid introducing generic-heavy APIs on the public surface.
- Do not let workflow primitives leak adapter internals into user-facing API.

## Open questions

- Which adapter should implement resume/HITL first?
- Should adapter errors be diagnostics or hard failures by default?
