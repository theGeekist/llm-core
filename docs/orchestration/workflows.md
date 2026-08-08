# Workflow interoperability

The workflow front contains portable declarative intent rather than a runnable
workflow object.

<<< @/snippets/v2/workflow-composition.ts

Runtime adapters qualify exact portable and native operations independently.
A supported portable workflow-intent operation does not imply support for a
native graph, durable history, reducer, checkpoint, interrupt, signal, retry,
or scheduling operation. Native operations retain their runtime identity and
ownership; unpreserved applicable operations are `unsupported`.

Controlled-effect contracts and internal conformance fixtures remain in the
kernel, but applications do not import a kernel-owned `runWorkflow` or
`resumeWorkflow` engine.
