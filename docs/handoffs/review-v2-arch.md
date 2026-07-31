# V2 architecture code-review handoff

## Responsibility

This handoff contains the latest code-review scope, evidence, findings, and acceptance criteria for the accessible-public-language rollout. It does not describe the public documentation review or the broader execution plan.

For execution order, use [the implementation handoff](./implement-v2-arch.md). For the earlier simplification rationale, use [the code simplification review](./review-code-simplification.md).

## Review scope

The review checked the uncommitted language rollout for:

- consistency between root exports, qualified feature/runtime fronts, the package export map, build entrypoints, and packed-package verification;
- common facade behavior for agents, tools, workflows, and conversations;
- call-site, test, example, and documentation alignment after breaking renames;
- immutability and ownership at public definition boundaries; and
- commit readiness, including focused tests and diff hygiene.

## Confirmed behavior

- Root and qualified fronts consistently use the common V2 vocabulary: `Agent`, `Tool`, `Workflow`, and `Conversation`.
- The package manifest, build entrypoints, and packed verifier agree on the exported surface.
- Common agents restrict ordinary tools to read-only effects; meaningful effects remain behind controlled runtime composition.
- `Workflow` is a ready object with `run` and `resume`; its common pause snapshot is process-local rather than a durable checkpoint.
- Fifteen focused facade and workflow tests passed with zero failures.

## Open finding: workflow definitions retain caller mutation

Severity: commit blocker.

`defineWorkflow` copies and freezes `config.steps` as an array but retains the caller-owned step objects and nested retry records. After definition, a caller can mutate `step.key`, `step.execute`, or retry configuration and alter the identity or behavior of an already-created workflow.

The reproduction observed:

- `Object.isFrozen(workflow) === true`;
- `Object.isFrozen(workflow.steps) === true`;
- `Object.isFrozen(workflow.steps[0]) === false`; and
- execution returning state produced by the replacement callback.

The relevant implementation is [workflow/registry.ts](../../packages/llm-core/src/application/workflow/registry.ts). Existing tests do not cover post-definition mutation of the caller's step or retry objects.

## Acceptance criteria

The finding is closed when:

1. workflow definition snapshots every step record and its nested retry configuration;
2. later mutations to the caller's step key, callback, or retry object cannot change the workflow;
3. executable callbacks retain their intended identity and `MaybePromise` behavior;
4. captured step and retry records have deliberate, tested immutability; and
5. a regression proves both behavioral detachment and structural immutability.

Review all `defineWorkflow` call sites and dependent signatures before choosing the implementation. Do not broaden the change into durable resume redesign.

## Evidence and non-findings

Commands used in the review included focused facade/workflow tests, `git diff --check`, a direct post-definition mutation reproduction, and the historical public-export inventory script.

The inventory script's refusal to run at the current head is not a product defect: it is intentionally pinned to baseline commit `17d2b38`. The optional live PydanticAI skip is also intentional. Neither closes or weakens the workflow finding.
