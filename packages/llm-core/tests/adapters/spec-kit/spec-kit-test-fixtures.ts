/* eslint-disable max-params -- Test fixture builders keep native overlay coordinates explicit. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  importSpecKitFiles,
  type SpecKitFile,
  type SpecKitFileSource,
} from "../../../src/adapters/spec-kit/public";

export const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
export const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
export const observedAt = "2026-08-02T06:07:24.000Z";
export const exactSpecKitPython = process.env.LLM_CORE_SPEC_KIT_PYTHON;

export const provenance = (
  tier: SpecKitFile["provenance"]["tier"],
  providerId: string,
  order: number,
  extra: Partial<SpecKitFile["provenance"]> = {},
): SpecKitFile["provenance"] => ({
  tier,
  providerId,
  resolutionScope: "artifact:default",
  order,
  ...extra,
});

export const importedFiles = (files: readonly SpecKitFile[]) =>
  importSpecKitFiles({
    observedAt,
    sources: [
      {
        sourceId: "spec-kit.payment-service",
        revision: "git:c0fe0e4",
        role: "primary",
        authority: "authoritative",
        files,
      },
    ],
  });

export const importedSources = (sources: readonly SpecKitFileSource[]) =>
  importSpecKitFiles({ observedAt, sources });

export const workflowOverlayFile = (
  overlayId: string,
  priority: number,
  enabled: boolean,
  order: number,
): SpecKitFile => ({
  path: `.specify/workflows/overlays/speckit/${overlayId}.yml`,
  content: `id: ${overlayId}\nextends: speckit\npriority: ${priority}\nenabled: ${String(enabled)}\nedits:\n  - remove: review-plan\n`,
  kind: "overlay",
  provenance: provenance("workflow-overlay", `project:${overlayId}`, order, {
    resolutionScope: "workflow:speckit",
    priority,
  }),
});

export const nestedWorkflowOverlayFile = (
  overlayId: string,
  priority: number,
  enabled: boolean,
  order: number,
  edits: string,
): SpecKitFile => ({
  path: `.specify/workflows/overlays/control-flow-proof/${overlayId}.yml`,
  content: `id: ${overlayId}\nextends: control-flow-proof\npriority: ${priority}\nenabled: ${String(enabled)}\nedits:\n${edits}`,
  kind: "overlay",
  provenance: provenance("workflow-overlay", `project:${overlayId}`, order, {
    resolutionScope: "workflow:control-flow-proof",
    priority,
  }),
});

export const nestedWorkflowBaseFile = (order: number): SpecKitFile => ({
  path: ".specify/workflows/control-flow-proof/workflow.yml",
  content: fixture("workflow-control-flow-c0fe0e4.yml"),
  kind: "workflow",
  provenance: provenance("core", "control-flow-proof", order, {
    resolutionScope: "workflow:control-flow-proof",
  }),
});
