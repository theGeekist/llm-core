# Plan

Status: in progress.

Stage 8 implements real adapters for each ecosystem using the Stage 7 contracts and parity tests.
Execution is construct-first; each construct is implemented across ecosystems in parallel.
This stage adds integration tests gated by environment to avoid CI breakage.

## Requirements

- Implement adapter modules per ecosystem (LangChain, LlamaIndex, AI SDK), construct by construct.
- Keep adapter code isolated from core workflow runtime.
- Wire adapters into lifecycle helpers without widening public API.
- Resume should run through pipeline with adapters once a HITL adapter exists.
- Add workflow-side primitives to support adapters (context accessors, capability checks, adapter validation).
- Env-gated integration tests (Ollama daemon, API keys).

## Scope

- In: adapter implementations, integration tests, runtime wiring for adapters/resume.
- Out: new recipes or changes to core pipeline semantics.

## Files and entry points

- src/adapters/langchain/\*
- src/adapters/llamaindex/\*
- src/adapters/ai-sdk/\*
- src/workflow/\*
- tests/interop/\*
- tests/integration/\*
- docs/implementation-plan.md

## Action items

[x] Implement adapters per construct across ecosystems (embeddings across langchain/llamaindex/ai-sdk).
[x] Implement text splitter adapters (langchain + llamaindex; AI SDK has no splitter abstraction).
[x] Implement retriever adapters (langchain + llamaindex; AI SDK has no retriever abstraction).
[x] Use per-ecosystem subfolders: adapters/langchain/{construct}.ts, adapters/llamaindex/{construct}.ts, adapters/ai-sdk/{construct}.ts.
[x] Add workflow helpers: adapter-aware context accessors, capability predicates, adapter validation.
[ ] Add integration tests gated by env vars (OLLAMA_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY).
[ ] Organize integration tests by construct: tests/integration/{construct}.{ecosystem}.test.ts.
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
