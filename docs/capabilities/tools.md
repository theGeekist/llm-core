# Tools

A `ToolSpec` declares a tool's identity and execution contract. It contains a
registered input schema, effect classification, target list, concurrency mode,
cancellation behavior, idempotency semantics, and retry-after-start rule.

<<< @/snippets/v2/tool-binding.ts

Registration canonicalizes the schema and binds it to a digest. Validation is
strict: arguments are checked without coercion, unknown fields can be rejected,
and the validator cannot replace the caller's normalized input.

`createToolBinding` joins the portable specification to a live executor. The
binding validates every call before invoking that executor.

## Actions and effects

`bindAction` turns a tool call and specification into a canonical
`ActionDocument`. `actionDigest` binds policy, approval, and receipt decisions
to that exact action. If arguments or effect targets change, the digest changes.

Effect classes make operational risk explicit:

| Effect class           | Meaning                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `read-only`            | Observes without changing a meaningful external resource     |
| `idempotent-write`     | Repeating the same action has the declared idempotent effect |
| `non-idempotent-write` | Repetition can create an additional meaningful effect        |
| `unknown`              | The host cannot establish safer semantics                    |

A tool declaration does not execute itself. Route meaningful effects through
controlled tool execution so policy, approval, receipts, and recovery apply.
