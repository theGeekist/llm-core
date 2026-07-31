import {
  capabilityIdForPort,
  createCapabilityBindingCatalog,
  type CapabilityEvidenceVerifier,
} from "@geekist/llm-core/agent/runtime";
import type { CapabilityBinding } from "@geekist/llm-core/contracts";
import type { Retriever } from "@geekist/llm-core/retrieval";

declare const retriever: Retriever;
declare const descriptor: CapabilityBinding;
declare const verifyEvidence: CapabilityEvidenceVerifier;

const catalog = createCapabilityBindingCatalog({
  verifyEvidence,
});

catalog.register({
  kind: "retriever",
  descriptor,
  port: retriever,
});

const resolution = catalog.resolve({
  requirements: [
    {
      kind: "retriever",
      bindingId: descriptor.bindingId,
      capabilities: [
        {
          capabilityId: capabilityIdForPort("retriever"),
          versionRange: "^1.0.0",
        },
      ],
    },
  ],
});

if (resolution.kind === "unresolved") {
  throw new Error(JSON.stringify(resolution.diagnostics));
}
