# Why llm-core?

LLM features often begin as a direct provider call. Parsing, retries, tools,
storage, and human approval arrive later, and the original script becomes the
place where unrelated concerns meet.

`llm-core` gives those concerns explicit boundaries.

- Specs capture portable intent.
- Runners own live execution.
- Capability ports keep provider choices local.
- Interaction projections create UI state from canonical events.
- Policy, approval, execution, and receipts remain separate.

This structure makes changes easier to review. A model adapter can change
without redefining tool authority. A UI integration can change without becoming
the source of execution truth. A persisted checkpoint can be inspected without
embedding a live continuation.

Portability here means JSON-compatible contracts with explicit identity and
versioning. It does not mean that every runtime supports every adapter. Runtime
support is stated only where it is tested.
