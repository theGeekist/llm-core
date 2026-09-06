# Antigravity CLI hooks adapter

The Antigravity CLI adapter is pinned to the host-observed Google Antigravity CLI `1.1.27`. Live host probes qualify headless start, idle continuation and stream observation. The adapter remains an internal candidate until publication work adds a supported package export.

Applications supply CLI process execution through `AntigravityCliClient`. The client emits the pinned native stream records: `init`, nested `step_update`, and terminal `result`. The adapter does not read an executable path, hook directory, endpoint, credential or process policy from ambient host state.

Applications also supply `AntigravityCliHooksOutputProjector`. Native output crosses this injected redaction boundary before becoming portable `AgentResult.output`. Rejection fails the run and emits `agent.run.failed`.

## Portable operations

| Portable operation | Antigravity `1.1.27` route | Disposition |
| --- | --- | --- |
| `conversation.start` | `agy -p` headless invocation | supported |
| `conversation.continue` | `agy -p --conversation <id>` idle continuation | supported |
| `run.observe` | Native stream JSON | supported |
| `run.input.submit` | No qualified active-input route | unsupported, `qualification-failed` |
| `run.cancel` | No qualified cancellation route | unsupported, `qualification-failed` |

The host version probe `/Users/jasonnathan/.local/bin/agy --version` returned `1.1.27`. The start probe returned conversation `eed87062-a0d6-403e-bcbe-30a172880417`, output `AGY_START_0905`, native `init`, nested `step_update`, and terminal `result` with status `SUCCESS`. Idle continuation used that conversation ID, returned the same ID, output `AGY_CONTINUE_0905`, and terminated with `SUCCESS`.

These probes qualify start, idle continuation and observation only. Active input and cancellation remain unsupported until their exact live gates pass. `submitInput` and `cancel` return typed unsupported acknowledgements without invoking hook inbox or process cancellation side effects. The runner reports `cancellation: "none"`.

A current active-input probe also produced a bounded negative. CLI `1.1.27` loaded one named `PostInvocation` hook, but did not invoke its handler while conversation `9c9daf7f-d583-4108-b006-efeb48a8472d` ran an eight-second command. The command completed normally and returned only `AGY_ORIGINAL_DONE_20260905C`; the queued nonce remained untouched. The temporary shared hook configuration was removed after the probe. Current `agy --help` exposes no active-run cancellation operation.

The adapter exposes the returned conversation ID only as an opaque `ProviderSessionRef`. A continuation exposes the supplied provider session immediately after start. Every later native stream event must carry that same conversation identity or the run fails closed. Each invocation receives a distinct portable `RunId`.

`AntigravityHookInvocationProjection` is a post-validation application projection, not the raw native hook input contract. Its host-owned inbox helper prepares boundary-specific `PreInvocation` and `PostInvocation` output for further qualification work. Composition commits the claim only after native stdout succeeds, or releases it for redelivery. `Stop` prepares explicit refusals and removes them only after the stop output is committed.

## Boundaries

- A concurrent headless continuation of an active conversation is rejected before a second process spawns.
- `/btw` and hook injection are not advertised as active input.
- Raw stream events, native paths and provider payloads remain inside the adapter.
- Native identity drift, malformed events and process loss produce failed terminal outcomes.
- The adapter reports `controlledEffects: false`, `interventions: false` and `cancellation: "none"`.

The exact source contract is the Google Antigravity CLI and hooks protocol pinned to the host-observed version `1.1.27`. Active-input and cancellation qualification remain outstanding.
