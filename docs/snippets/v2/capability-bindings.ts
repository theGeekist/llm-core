import {
  capabilityIdForPort,
  createCapabilityCandidateCatalog,
  type CapabilityCandidateEvidenceVerifier,
} from "@geekist/llm-core/adapters/catalogue";
import {
  acquireCapabilityBindings,
  registerCapabilityAcquisitionFactory,
  type CapabilityAcquisitionFactoryVerifier,
} from "@geekist/llm-core/adapters/catalogue/runtime";
import type { CapabilityBinding } from "@geekist/llm-core/contracts";
import type { Retriever } from "@geekist/llm-core/retrieval";

declare const retriever: Retriever;
declare const descriptor: CapabilityBinding;
declare const verifyEvidence: CapabilityCandidateEvidenceVerifier;
declare const verifyAcquisitionFactory: CapabilityAcquisitionFactoryVerifier;

const catalog = createCapabilityCandidateCatalog({
  verifyEvidence,
  verifyAcquisitionFactory,
});

const candidate = catalog.register({
  kind: "retriever",
  descriptor,
});

const resolution = catalog.resolve({
  requirements: [
    {
      kind: "retriever",
      bindingId: descriptor.bindingId,
      capabilities: [
        {
          capabilityId: capabilityIdForPort("retriever"),
          versionRange: "1.0.0",
        },
      ],
    },
  ],
});

if (resolution.kind === "unresolved") {
  throw new Error(JSON.stringify(resolution.diagnostics));
}

const factory = registerCapabilityAcquisitionFactory(candidate, {
  kind: "retriever",
  bindingId: descriptor.bindingId,
  acquire: () => ({ port: retriever }),
});

const acquired = await acquireCapabilityBindings(resolution, [factory]);
const binding = acquired.bindings[0];
if (binding?.kind === "retriever") void binding.port.retrieve;
