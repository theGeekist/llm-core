# Stage 13: Parity Tightening + Write Path

Status: in progress.

## Scope

Stage 13 is the parity phase: make adapter coverage across AI SDK, LangChain, and
LlamaIndex explicit, close missing core constructs, and document what remains
out of scope.

## Sources of Truth

- Audit: `docs/interop-audit.md`
- Backlog (done vs pending): `internal/stage-13-backlog.md`

## Design Principles

- Keep the adapter surface minimal and value-first.
- Maintain MaybePromise semantics and deterministic behavior.
- Diagnostics must surface missing capability/constructs clearly.
