import {
  createSpecificationDecision,
  createSpecificationSourceSnapshot,
} from "../../features/specifications/runtime";
import type {
  SpecificationDiagnostic,
  SpecificationDecision,
  SpecificationGraph,
  SpecificationNodeId,
  SpecificationQuestion,
  SpecificationRelationship,
} from "../../features/specifications/runtime";
import type {
  SpecificationDependencyPlan,
  SpecificationReview,
  SpecificationWorkflowPlan,
  TargetNeutralCompiledPlan,
} from "./types";

const byText = (left: string, right: string): number => left.localeCompare(right);

const sorted = <T>(values: readonly T[], key: (value: T) => string): T[] =>
  [...values].sort((left, right) => byText(key(left), key(right)));

const dependencyRelationships = (graph: SpecificationGraph): SpecificationRelationship[] =>
  sorted(
    graph.relationships.filter((relationship) => relationship.kind === "depends-on"),
    (relationship) => relationship.relationshipId,
  );

export const deriveDependencyPlan = (graph: SpecificationGraph): SpecificationDependencyPlan => {
  const nodeIds = sorted(graph.nodes, (node) => node.nodeId).map((node) => node.nodeId);
  const dependents = new Map<SpecificationNodeId, SpecificationNodeId[]>();
  const degrees = new Map(nodeIds.map((nodeId) => [nodeId, 0]));
  const relationships = dependencyRelationships(graph);
  for (const relationship of relationships) {
    const targets = dependents.get(relationship.to) ?? [];
    targets.push(relationship.from);
    dependents.set(relationship.to, targets);
    degrees.set(relationship.from, (degrees.get(relationship.from) ?? 0) + 1);
  }
  const ready = nodeIds.filter((nodeId) => degrees.get(nodeId) === 0);
  const orderedNodeIds: SpecificationNodeId[] = [];
  while (ready.length > 0) {
    ready.sort(byText);
    const nodeId = ready.shift();
    if (nodeId === undefined) break;
    orderedNodeIds.push(nodeId);
    for (const dependent of dependents.get(nodeId) ?? []) {
      const nextDegree = (degrees.get(dependent) ?? 0) - 1;
      degrees.set(dependent, nextDegree);
      if (nextDegree === 0) ready.push(dependent);
    }
  }
  return {
    orderedNodeIds,
    relationshipIds: relationships.map((relationship) => relationship.relationshipId),
    blockedNodeIds: nodeIds.filter((nodeId) => !orderedNodeIds.includes(nodeId)),
  };
};

export const deriveWorkflowPlan = (graph: SpecificationGraph): SpecificationWorkflowPlan => ({
  nodeIds: sorted(graph.nodes, (node) => node.nodeId).map((node) => node.nodeId),
  relationshipIds: sorted(graph.relationships, (relationship) => relationship.relationshipId).map(
    (relationship) => relationship.relationshipId,
  ),
});

const questionNodes = (graph: SpecificationGraph): SpecificationQuestion[] =>
  sorted(
    graph.nodes.filter((node) => node.kind === "question"),
    (node) => node.nodeId,
  ).map((node) => ({ questionId: node.nodeId, prompt: node.title, source: node.source }));

const dependencyIssues = (
  blockedNodeIds: readonly SpecificationNodeId[],
): SpecificationDiagnostic[] =>
  blockedNodeIds.map((nodeId) => ({
    code: "dependency-cycle",
    severity: "error",
    impact: "blocking",
    explanation: "Dependency-bearing relationships must be acyclic for compilation.",
    nodeId,
  }));

const issueAffectsScope = (
  graph: SpecificationGraph,
  acceptedScope: readonly SpecificationNodeId[],
  issue: SpecificationDiagnostic,
): boolean => {
  if (issue.nodeId !== undefined) return acceptedScope.includes(issue.nodeId);
  if (issue.source === undefined) return false;
  return graph.nodes.some(
    (node) =>
      acceptedScope.includes(node.nodeId) &&
      node.source.sourceId === issue.source?.sourceId &&
      node.source.documentId === issue.source?.documentId,
  );
};

const missingDecisionQuestion = (graph: SpecificationGraph): SpecificationQuestion => {
  const node = sorted(graph.nodes, (candidate) => candidate.nodeId)[0];
  if (node !== undefined) {
    return {
      questionId: `review.${graph.graphId}`,
      prompt: "An accepted specification decision is required before compilation.",
      source: node.source,
    };
  }
  const source = createSpecificationSourceSnapshot(graph.sources[0]!);
  return {
    questionId: `review.${graph.graphId}`,
    prompt: "An accepted specification decision is required before compilation.",
    source: { sourceId: source.sourceId, documentId: source.documents[0]!.documentId },
  };
};

const acceptedScopeOf = (
  decision: SpecificationDecision | undefined,
): readonly SpecificationNodeId[] | undefined =>
  decision?.status === "accepted" ? decision.record.acceptedScope : undefined;

const blockingIssuesForScope = (input: {
  readonly graph: SpecificationGraph;
  readonly dependency: SpecificationDependencyPlan;
  readonly diagnostics: readonly SpecificationDiagnostic[];
  readonly acceptedScope: readonly SpecificationNodeId[] | undefined;
}): SpecificationDiagnostic[] => {
  const { acceptedScope, dependency, diagnostics, graph } = input;
  if (acceptedScope === undefined) return [];
  return [
    ...diagnostics.filter(
      (issue) => issue.impact === "blocking" && issueAffectsScope(graph, acceptedScope, issue),
    ),
    ...dependencyIssues(
      dependency.blockedNodeIds.filter((nodeId) => acceptedScope.includes(nodeId)),
    ),
  ];
};

const questionsForScope = (
  questions: readonly SpecificationQuestion[],
  acceptedScope: readonly SpecificationNodeId[] | undefined,
): readonly SpecificationQuestion[] => {
  if (acceptedScope === undefined) return questions;
  return questions.filter((question) =>
    acceptedScope.includes(question.questionId as SpecificationNodeId),
  );
};

const reviewDecision = (input: {
  readonly graph: SpecificationGraph;
  readonly supplied: SpecificationDecision | undefined;
  readonly questions: readonly SpecificationQuestion[];
  readonly scopedQuestions: readonly SpecificationQuestion[];
  readonly blockingIssues: readonly SpecificationDiagnostic[];
}): SpecificationDecision => {
  const { blockingIssues, graph, questions, scopedQuestions, supplied } = input;
  if (supplied === undefined) {
    return createSpecificationDecision({
      status: "needs-input",
      questions: questions.length > 0 ? questions : [missingDecisionQuestion(graph)],
    });
  }
  if (supplied.status !== "accepted") return supplied;
  if (blockingIssues.length > 0) {
    return createSpecificationDecision({ status: "rejected", issues: blockingIssues });
  }
  if (scopedQuestions.length > 0) {
    return createSpecificationDecision({ status: "needs-input", questions: scopedQuestions });
  }
  return supplied;
};

export const reviewSpecificationGraph = (
  graph: SpecificationGraph,
  suppliedDecision?: SpecificationDecision,
): SpecificationReview => {
  const dependency = deriveDependencyPlan(graph);
  const workflow = deriveWorkflowPlan(graph);
  const diagnostics: readonly SpecificationDiagnostic[] = [];
  const issues = dependencyIssues(dependency.blockedNodeIds);
  const questions = questionNodes(graph);
  const supplied =
    suppliedDecision === undefined ? undefined : createSpecificationDecision(suppliedDecision);
  const acceptedScope = acceptedScopeOf(supplied);
  const decision = reviewDecision({
    graph,
    supplied,
    questions,
    scopedQuestions: questionsForScope(questions, acceptedScope),
    blockingIssues: blockingIssuesForScope({ graph, dependency, diagnostics, acceptedScope }),
  });
  return { graph, dependency, workflow, decision, issues, questions };
};

export const deriveTargetNeutralPlan = (
  graph: SpecificationGraph,
  acceptedScope: readonly SpecificationNodeId[],
): TargetNeutralCompiledPlan => {
  const scope = new Set(acceptedScope);
  const dependency = deriveDependencyPlan(graph);
  const externalPrerequisiteNodes = graph.relationships
    .filter(
      (relationship) =>
        relationship.kind === "depends-on" &&
        scope.has(relationship.from) &&
        !scope.has(relationship.to),
    )
    .map((relationship) => relationship.from);
  const blockedNodeIds = sorted(
    [
      ...new Set([
        ...dependency.blockedNodeIds.filter((nodeId) => scope.has(nodeId)),
        ...externalPrerequisiteNodes,
      ]),
    ],
    (nodeId) => nodeId,
  );
  return {
    version: graph.version,
    acceptedScope: sorted(acceptedScope, (nodeId) => nodeId),
    dependency: {
      orderedNodeIds: dependency.orderedNodeIds.filter(
        (nodeId) => scope.has(nodeId) && !blockedNodeIds.includes(nodeId),
      ),
      relationshipIds: dependency.relationshipIds.filter((relationshipId) => {
        const relationship = graph.relationships.find(
          (candidate) => candidate.relationshipId === relationshipId,
        );
        return (
          relationship !== undefined && scope.has(relationship.from) && scope.has(relationship.to)
        );
      }),
      blockedNodeIds,
    },
    workflow: {
      nodeIds: deriveWorkflowPlan(graph).nodeIds.filter((nodeId) => scope.has(nodeId)),
      relationshipIds: deriveWorkflowPlan(graph).relationshipIds.filter((relationshipId) => {
        const relationship = graph.relationships.find(
          (candidate) => candidate.relationshipId === relationshipId,
        );
        return (
          relationship !== undefined && scope.has(relationship.from) && scope.has(relationship.to)
        );
      }),
    },
  };
};
