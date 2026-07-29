import { createArtifact } from "@geekist/llm-core/artifacts";
import { digest, newCoreId, type InvocationId, type ResourceId } from "@geekist/llm-core/contracts";

const artifact = createArtifact({
  content: {
    resourceId: newCoreId<ResourceId>("0190bd0c-0000-7000-8000-000000002430"),
    mediaType: "application/json",
    byteLength: 42,
    digest: digest("b".repeat(64)),
  },
  provenance: {
    kind: "generated",
    invocationId: newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000002431"),
  },
  metadata: { name: "answer.json" },
});

console.log(artifact.ref, artifact.provenance);
