import { createHash } from "node:crypto";
import type { SpecKitFileSource } from "./file-types";

/** Native identities retain their source tuple and exact order, not core UUID semantics. */
export const specKitFileIdentity = (sourceId: string, path: string): string =>
  `spec-kit.node.${createHash("sha256")
    .update(JSON.stringify([sourceId, path]))
    .digest("hex")}`;

export const specKitGraphIdentity = (sources: readonly SpecKitFileSource[]): string =>
  `spec-kit.graph.${createHash("sha256")
    .update(JSON.stringify(sources.map((source) => [source.sourceId, source.revision])))
    .digest("hex")}`;

/** A project overlay provider and target workflow scope are distinct native identities. */
export const workflowOverlayProvider = (overlayId: string): string => `project:${overlayId}`;
export const workflowResolutionScope = (workflowId: string): string => `workflow:${workflowId}`;
export const isWorkflowResolutionScope = (scope: string): boolean => scope.startsWith("workflow:");
export const overlayEditLocation = (index: number): string => `/edits/${index}`;
