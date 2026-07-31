import type {
  ConversionReport,
  SpecificationSourceBinding,
  SpecificationSourceSnapshot,
} from "./types";
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

export const assertReportBindings = (
  report: ConversionReport,
  sources: readonly SpecificationSourceSnapshot[],
  nodeIds: ReadonlySet<string>,
): void => {
  report.issues.forEach((issue) => {
    if (issue.source !== undefined) {
      assertKnownBinding(
        issue.source,
        sources,
        "conversion report issue bindings to declared source documents",
      );
    }
    if (issue.nodeId !== undefined && !nodeIds.has(issue.nodeId)) {
      fail("conversion report issue node identities that reference declared graph nodes");
    }
  });
};
