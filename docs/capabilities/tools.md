# Tools

`defineTool` turns a `ToolConfig` into a ready `Tool`. The common configuration
uses a familiar name, description, strict input contract, effect, and execute
function.

<<< @/snippets/v2/tool.ts

The facade snapshots its schema, validates every call without coercion, and
keeps registration and execution provenance out of ordinary application code.
A meaningful effect supplied as a short class name is rejected because its
targets must be explicit.

## Runtime extensions

Runtime and control implementers import from
`@geekist/llm-core/tools/runtime`:

| Contract               | Responsibility                                              |
| ---------------------- | ----------------------------------------------------------- |
| `ToolDefinition`       | Portable identity, schema, effects, and execution semantics |
| `ExecutableTool`       | Provenanced runtime tool that validates before execution    |
| `ToolExecutionResult`  | Portable succeeded or failed execution result               |
| `ToolExecutionFailure` | Safe failure code, message, and retryability                |
| `defineToolDefinition` | Validate and freeze a portable runtime definition           |
| `createExecutableTool` | Join a definition, strict validator, and executor           |

The exact `ExecutableTool` returned by `createExecutableTool` carries runtime
provenance. Shaped objects, casts, spreads, and clones do not.

## Actions and effects

`bindAction` turns a tool call and definition into a canonical
`ActionDocument`. `actionDigest` binds policy, approval, and receipt decisions
to that exact action. If arguments or effect targets change, the digest changes.

| Effect class     | Meaning                                                  |
| ---------------- | -------------------------------------------------------- |
| `read-only`      | Observes without changing a meaningful external resource |
| `reversible`     | Changes state and has an explicit compensation path      |
| `external-write` | Changes a resource outside the current process           |
| `destructive`    | Irreversibly deletes or damages meaningful state         |
| `privileged`     | Requires elevated authority                              |

Effect class describes operational risk. Idempotency remains a separate
execution guarantee.

## What the action digest binds

`actionDigest` requires an `ActionDigestPort` to compute HMAC-SHA-256 over the
UTF-8 bytes of the canonical action document. The port resolves an opaque,
rotation-capable secret reference inside the supplied security domain. The
returned value is the 43-character unpadded base64url encoding of the 32-byte
digest.

| Included                                            | Deliberately excluded                              |
| --------------------------------------------------- | -------------------------------------------------- |
| Tool ID, version, and input-schema digest           | Run, step, tool-call, and correlation IDs          |
| Effect class and exact targets                      | Trace and observability identity                   |
| Tenant, principal, and delegation authority present | Idempotency keys and attempt counters              |
| Execution and idempotency semantics                 | Policy or approval decisions                       |
| Strict normalized arguments                         | Receipt lifecycle and timestamps                   |
|                                                     | Credentials, provider clients, and native payloads |

A tool does not grant itself authority. Route meaningful effects through
controlled execution so policy, approval, receipts, and recovery apply.
