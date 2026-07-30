import type { CapabilityRequirement } from "@geekist/llm-core/contracts";
import { createModelResolver, modelRef, type ModelBinding } from "@geekist/llm-core/model";

declare const bindings: readonly ModelBinding[];
declare const requiredCapabilities: readonly CapabilityRequirement[];

const resolver = createModelResolver({
  constraintEvaluator: () => true,
  policyEvaluator: ({ binding }) => binding.provider !== "provider.blocked",
});

const outcome = resolver.resolve({
  selection: modelRef("model.reasoning"),
  bindings,
  requiredCapabilities,
  policy: {
    defaultModel: modelRef("model.standard"),
  },
});

if (outcome.kind === "unresolved") {
  throw new Error(JSON.stringify(outcome.diagnostics));
}

console.log(outcome.resolution.matchedBy, outcome.resolution.binding.bindingId);
