# Connector characterisation evidence

Both executable tests are the evidence anchors for this report:

- MCP: `connector characterization: MCP tool and resource slice > discovers,
prepares, invokes, fails and reconciles through the qualified MCP boundary`
  in `mcp-vertical-slice.test.ts:16-136`.
- OAuth SaaS: `connector characterization: OAuth SaaS slice > keeps consent,
pagination, rate limiting, webhooks and reconciliation application-owned` in
  `oauth-saas-vertical-slice.test.ts:114-155`.

## Observed operations and fields

| Operation or field                | MCP observable anchor                                                                                                          | OAuth SaaS observable anchor                                                                                                                                                                       | Result                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery                         | `mcp-vertical-slice.test.ts:66-77` lists tools then reads an MCP resource.                                                     | `oauth-saas-vertical-slice.test.ts:117-129` returns provider capabilities and two cursor pages.                                                                                                    | Both discover, but their results are protocol catalogue/resource versus provider capabilities/pagination. No common discovery value is proposed.        |
| Preparation                       | `mcp-vertical-slice.test.ts:37-49,79-85` records the per-request principal and arguments delivered to the application binding. | `oauth-saas-vertical-slice.test.ts:45-49,131-136` validates and freezes a consent reference, cursor and amount without a credential value.                                                         | Both prepare, but MCP owns a request principal while OAuth owns consent and cursor state. No common session, principal or credential field is proposed. |
| Controlled invocation             | `mcp-vertical-slice.test.ts:79-85` invokes a registered MCP tool and observes the controlled result.                           | `oauth-saas-vertical-slice.test.ts:51-66,138-140` invokes the SaaS action through `executeControlledTool`.                                                                                         | The existing controlled-effect path is the only common candidate, not a connector abstraction.                                                          |
| Failure                           | `mcp-vertical-slice.test.ts:87-98` proves the native thrown message becomes only `llm-core.controlled-tool.indeterminate`.     | `oauth-saas-vertical-slice.test.ts:149-153` returns an explicit provider rate-limit disposition.                                                                                                   | Both fail explicitly, but MCP wire sanitisation and SaaS retry timing are unlike. No shared failure or retry field is proposed.                         |
| Durable reconciliation            | `mcp-vertical-slice.test.ts:100-133` reconciles one indeterminate MCP-controlled receipt without reinvocation.                 | `oauth-saas-vertical-slice.test.ts:68-79,141-147` accepts one webhook, rejects its duplicate, requires its receipt binding before reconciliation, then proves webhook-before-reconciliation order. | Explicit receipt reconciliation is a common candidate. Webhook identity and ordering remain OAuth-only state.                                           |
| A2A identity, task and delegation | `mcp-vertical-slice.test.ts:16-136` exercises MCP principal, tool and resource operations only.                                | `oauth-saas-vertical-slice.test.ts:114-155` exercises consent, invoice and webhook operations only.                                                                                                | Neither slice supplies A2A identity, task or delegation evidence, so no A2A field or operation is proposed for a connector contract.                    |

## Proposed common boundary

The evidence supports only these existing controlled-effect operations:

- controlled invocation, anchored above at MCP `:79-85` and OAuth `:51-66,138-140`;
- an indeterminate durable receipt after an ambiguous effect, at MCP `:87-98`
  and OAuth `:138-140`; and
- explicit receipt reconciliation without reinvocation, at MCP `:100-133` and
  OAuth `:141-147`.

Each operation already belongs to the existing control and evidence path. This
task proposes no new connector-owned field, type, base class or public API.

## Rejected similarities

- A generic connector lifecycle or base class. MCP has per-request principal
  preparation (`mcp-vertical-slice.test.ts:37-49`); OAuth retains consent,
  cursor, webhook and rate-limit state
  (`oauth-saas-vertical-slice.test.ts:17-27,45-53,68-79`).
- A shared discovery result. MCP discovers tools and resources
  (`mcp-vertical-slice.test.ts:66-77`), while OAuth discovers capabilities and
  invoices by cursor (`oauth-saas-vertical-slice.test.ts:117-129`).
- Credential, pagination, webhook or rate-limit fields. OAuth proves an opaque
  consent reference without a token (`oauth-saas-vertical-slice.test.ts:131-136`)
  and owns cursor, webhook and rate-limit handling (`:37-42,68-79,149-153`);
  the MCP slice instead reads a static protocol resource (`mcp-vertical-slice.test.ts:72-77`).
- A2A task or delegation mapping. The observable MCP and OAuth test operations
  listed above contain none, so a mapping would be invented rather than derived.

## Reliability result

The common reliability evidence is limited to the existing controlled receipt:
ambiguous invocation becomes `indeterminate`, and a later source-specific
reconciler records an applied outcome. MCP remains request-scoped with
sanitised protocol failure. OAuth uses a receipt-bound accepted webhook as the
source for reconciliation, rejects a duplicate webhook before it can change
that source, and retains a provider-specific rate-limit disposition.
