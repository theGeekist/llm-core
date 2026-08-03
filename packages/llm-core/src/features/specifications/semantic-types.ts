import type { JsonObject, JsonValue } from "#contracts";
import type { SpecificationNodeId, SpecificationNodeShared } from "./types";

export type SpecificationSemanticNodeKind =
  | "application"
  | "agent"
  | "tool"
  | "context"
  | "workflow-intent"
  | "evaluation"
  | "approval"
  | "capability";

export type ApplicationIntent = JsonObject & {
  readonly capabilities: SpecificationNodeId[];
  readonly entrypoints: SpecificationNodeId[];
};

export type AgentIntent = JsonObject & {
  readonly role: string;
  readonly capabilities: SpecificationNodeId[];
  readonly tools: SpecificationNodeId[];
  readonly contexts: SpecificationNodeId[];
};

export type ToolEffectIntent = "none" | "read" | "write" | "external";

export type ToolIntent = JsonObject & {
  readonly capability: SpecificationNodeId;
  readonly effect: ToolEffectIntent;
  readonly inputSchema?: JsonValue;
  readonly outputSchema?: JsonValue;
};

export type ContextLifetimeIntent = "request" | "session" | "persistent";

export type ContextIntent = JsonObject & {
  readonly lifetime: ContextLifetimeIntent;
  readonly schema?: JsonValue;
};

export type WorkflowStepIntent = JsonObject & {
  readonly stepId: string;
  readonly invokes: SpecificationNodeId;
  readonly dependsOn: string[];
};

export type WorkflowIntent = JsonObject & {
  readonly steps: WorkflowStepIntent[];
};

export type EvaluationCriterionIntent = JsonObject & {
  readonly criterionId: string;
  readonly description: string;
};

export type EvaluationIntent = JsonObject & {
  readonly subject: SpecificationNodeId;
  readonly criteria: EvaluationCriterionIntent[];
};

export type ApprovalTimingIntent = "before" | "after";

export type ApprovalIntent = JsonObject & {
  readonly subject: SpecificationNodeId;
  readonly authority: string;
  readonly timing: ApprovalTimingIntent;
};

export type CapabilityModeIntent = "required" | "optional";

export type CapabilityIntent = JsonObject & {
  readonly capabilityId: string;
  readonly mode: CapabilityModeIntent;
  readonly constraints?: JsonValue;
};

export type SpecificationSemanticNode =
  | (SpecificationNodeShared & {
      readonly kind: "application";
      readonly content: ApplicationIntent;
    })
  | (SpecificationNodeShared & { readonly kind: "agent"; readonly content: AgentIntent })
  | (SpecificationNodeShared & { readonly kind: "tool"; readonly content: ToolIntent })
  | (SpecificationNodeShared & { readonly kind: "context"; readonly content: ContextIntent })
  | (SpecificationNodeShared & {
      readonly kind: "workflow-intent";
      readonly content: WorkflowIntent;
    })
  | (SpecificationNodeShared & { readonly kind: "evaluation"; readonly content: EvaluationIntent })
  | (SpecificationNodeShared & { readonly kind: "approval"; readonly content: ApprovalIntent })
  | (SpecificationNodeShared & { readonly kind: "capability"; readonly content: CapabilityIntent });

/** All node references carried by typed semantic intent. */
export const semanticNodeReferences = (
  node: SpecificationSemanticNode,
): readonly SpecificationNodeId[] => {
  switch (node.kind) {
    case "application":
      return [...node.content.capabilities, ...node.content.entrypoints];
    case "agent":
      return [...node.content.capabilities, ...node.content.tools, ...node.content.contexts];
    case "tool":
      return [node.content.capability];
    case "workflow-intent":
      return node.content.steps.map((step) => step.invokes);
    case "evaluation":
    case "approval":
      return [node.content.subject];
    case "context":
    case "capability":
      return [];
  }
  return [];
};
