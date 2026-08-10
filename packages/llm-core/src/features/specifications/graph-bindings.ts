import type { SpecificationSourceBinding, SpecificationSourceSnapshot } from "./types";
import { fail } from "./validation-support";

export const assertKnownBinding = (
  binding: SpecificationSourceBinding,
  sources: readonly SpecificationSourceSnapshot[],
  message = "node and relationship bindings to declared source documents",
): void => {
  const source = sources.find((candidate) => candidate.sourceId === binding.sourceId);
  if (!source || !source.documents.some((document) => document.documentId === binding.documentId)) {
    fail(message);
  }
};
