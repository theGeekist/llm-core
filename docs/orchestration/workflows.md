# Workflow interoperability

The workflow front contains portable declarative intent rather than a runnable
workflow object.

<<< @/snippets/v2/workflow-composition.ts

Runtime adapters decide how supported steps map to native graphs or durable
workflows. They preserve native reducers, checkpoint formats, interrupt
semantics, and scheduling guarantees and report any conversion loss.

Controlled-effect contracts and internal conformance fixtures remain in the
kernel, but applications do not import a kernel-owned `runWorkflow` or
`resumeWorkflow` engine.
