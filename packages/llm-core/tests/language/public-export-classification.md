# Public export classification baseline

ADR-012 classifies the current 731 compiler-resolved exports across 19
entrypoints. Inventory must use the TypeScript checker so wildcard barrels and
aliases resolve to their declarations.

## Reproduce the inventory

Run:

```sh
node packages/llm-core/tests/language/inventory-public-exports.mjs
```

The script emits a stable JSON inventory containing every exported name and
its declaration source, then verifies these entrypoint counts:

| Entrypoint                  | Count |
| --------------------------- | ----: |
| root                        |    11 |
| `./functional`              |    14 |
| `./contracts`               |    96 |
| `./model`                   |   106 |
| `./tools`                   |    50 |
| `./control`                 |    41 |
| `./evidence`                |    25 |
| `./state`                   |    51 |
| `./context`                 |    13 |
| `./artifacts`               |     6 |
| `./evaluation`              |    18 |
| `./agent`                   |   190 |
| `./workflow`                |    35 |
| `./interaction`             |    37 |
| `./adapters/ai-sdk`         |    20 |
| `./adapters/ai-sdk-ui`      |     7 |
| `./adapters/assistant-ui`   |     5 |
| `./adapters/openai-chatkit` |     2 |
| `./adapters/nlux-ui`        |     4 |

Total: 731.

## Classification rule

The executable inventory is authoritative. Every current `(entrypoint, name)`
row contains:

- `kind`: runtime, type, or both;
- `classification`: common, extension, internal, or split;
- `target`: the exact post-rollout front, or `null` when removed; and
- `action`: keep, move, remove, rename, replace, or add-and-keep.

The script uses exact exception sets and exact replacement rows. Only exports
not named by those sets default to extension placement derived from their
declaration source. This makes all 731 decisions machine-verifiable while
keeping uncertain lifecycle machinery out of common fronts.

Notable split outcomes are explicit: `InteractionUiEvent` remains available to
extension users while the common facade adds `ConversationEvent`. Portable
`AgentSpec`, `PreparedAgentSpec` and `ToolSpec` become extension definitions;
their new common facades are separate additions rather than aliases.

## Target ownership

- Common: root, `./agent`, `./tools`, `./workflow`, `./conversation`,
  `./model`, `./control`, `./context`, `./artifacts`, `./evaluation`.
- Runtime extension: `./agent/runtime`, `./tools/runtime`,
  `./workflow/runtime`, `./model/runtime`, `./control/runtime`.
- Capability extension: `./contracts`, `./evidence`, `./state`,
  `./interaction`, `./retrieval`, `./indexing`, `./storage`, `./memory`,
  `./media`.
- Qualified extension: every `./adapters/*`.
