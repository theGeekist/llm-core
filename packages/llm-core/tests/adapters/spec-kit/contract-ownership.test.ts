import { describe, expect, test } from "bun:test";
import {
  importSpecKitFiles,
  type SpecKitFileImportInput,
} from "../../../src/adapters/spec-kit/public";

const nativeFile = {
  path: ".specify/memory/constitution.md",
  content: "# Project constitution",
  kind: "constitution",
  provenance: {
    tier: "project",
    providerId: "project:example",
    resolutionScope: "artifact:constitution",
    order: 0,
  },
} as const;

const observation = (file: unknown) => ({
  observedAt: "2026-10-20T00:00:00.000Z",
  sources: [
    {
      sourceId: "project.example",
      revision: "git:example",
      role: "primary",
      authority: "authoritative",
      files: [file],
    },
  ],
});

// The cast deliberately models malformed JSON crossing the typed public boundary.
const importObservation = (file: unknown) =>
  importSpecKitFiles(observation(file) as SpecKitFileImportInput);

describe("Spec Kit native string contracts", () => {
  test("retains the decision meaning of a valid native constitution", () => {
    expect(importObservation(nativeFile)).toMatchObject({
      graph: { nodes: [{ kind: "decision" }] },
    });
  });

  test.each(["role", "authority"] as const)("rejects an array-valued source %s", (field) => {
    const input = observation(nativeFile);
    const source = input.sources[0]!;
    const malformed = {
      ...input,
      sources: [{ ...source, [field]: [source[field]] }],
    };
    expect(() => importSpecKitFiles(malformed as unknown as SpecKitFileImportInput)).toThrow(
      "Spec Kit imports require unique source groups with explicit role, authority, revision, and files.",
    );
  });

  test("rejects an array that stringifies to a document kind", () => {
    expect(() => importObservation({ ...nativeFile, kind: ["constitution"] })).toThrow(
      "Spec Kit files require explicit native provenance and resolution scope.",
    );
  });

  test("rejects an array that stringifies to a provenance tier", () => {
    expect(() =>
      importObservation({
        ...nativeFile,
        provenance: { ...nativeFile.provenance, tier: ["project"] },
      }),
    ).toThrow("Spec Kit files require explicit native provenance and resolution scope.");
  });
});
