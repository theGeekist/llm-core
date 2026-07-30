# Tools

A `ToolSpec` declares a tool's identity and execution contract. It contains a
registered input schema, effect classification, target list, concurrency mode,
cancellation behavior, idempotency semantics, and retry-after-start rule.

<<< @/snippets/v2/tool-binding.ts

Registration canonicalizes the schema and binds it to a digest. Validation is
strict: arguments are checked without coercion, unknown fields can be rejected,
and the validator cannot replace the caller's normalized input.

`createToolBinding` joins the portable specification to a live executor. The
exact frozen facade it returns is runtime-registered and validates every call
before invoking that executor. Shaped objects, casts, spreads, and clones do not
carry that provenance and are rejected before controlled side effects.

## Actions and effects

`bindAction` turns a tool call and specification into a canonical
`ActionDocument`. `actionDigest` binds policy, approval, and receipt decisions
to that exact action. If arguments or effect targets change, the digest changes.

Effect classes make operational risk explicit:

| Effect class     | Meaning                                                      |
| ---------------- | ------------------------------------------------------------ |
| `read-only`      | Observes without changing a meaningful external resource     |
| `reversible`     | Changes state and has an explicit compensation path          |
| `external-write` | Changes a resource outside the current process               |
| `destructive`    | Irreversibly deletes or damages meaningful state             |
| `privileged`     | Requires elevated authority even if the operation is bounded |

Effect class describes operational risk. Idempotency is a separate
`ToolExecutionSemantics.idempotency` guarantee: `not-supported`, `required`, or
`provider-enforced`. Retry after start is independently `never` or
`requires-conformance`.

## What the action digest binds

`actionDigest` is an HMAC-like security-domain binding produced by the
application's `ActionDigestPort`. The key arrives by opaque `SecretRef`, so key
rotation and storage remain outside portable action data.

| Included in the canonical action          | Deliberately excluded                    |
| ----------------------------------------- | ---------------------------------------- |
| Tool ID, version, and input-schema digest | Raw credential material                  |
| Effect class and exact effect targets     | Policy or approval decisions             |
| Authority identity and delegation chain   | Receipt lifecycle and timestamps         |
| Execution and idempotency semantics       | Provider clients and native payloads     |
| Strict normalized arguments               | Event delivery or storage implementation |

Policy, approval, and receipts bind to the resulting digest. Changing an
included fact requires a new decision; rotating the key changes the key
reference without exposing key material.

A tool declaration does not execute itself. Route meaningful effects through
controlled tool execution so policy, approval, receipts, and recovery apply.
