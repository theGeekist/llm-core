import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { contractVersion } from "#contracts";
import {
  importOpenSpecFiles,
  importOpenSpecStatusCli,
  OPENSPEC_FILE_SUPPORT,
  OPENSPEC_NPM_STATUS_CLI_SUPPORT,
  OPENSPEC_NPM_STATUS_CONTRACT,
  OPENSPEC_SOURCE_STATUS_CLI_SUPPORT,
  OPENSPEC_SOURCE_STATUS_CONTRACT,
} from "../../../src/adapters/openspec/public";
import { loadSpecification } from "../../../src/specifications";

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const supportedOperation = (support: typeof OPENSPEC_FILE_SUPPORT, operation: string) => {
  const declaration = support.operations.find((candidate) => candidate.operation === operation);
  if (declaration?.disposition !== "supported")
    throw new TypeError("Expected supported operation.");
  return declaration;
};

const common = {
  version: contractVersion("1.6.0"),
  sourceId: "openspec.product",
  revision: "git:19d4171",
  observedAt: "2026-08-02T00:00:00.000Z",
};

const sourceStatus = { ...common, contract: OPENSPEC_SOURCE_STATUS_CONTRACT };
const npmStatus = { ...common, contract: OPENSPEC_NPM_STATUS_CONTRACT };

describe("OpenSpec adapter", () => {
  test("validates documented file layouts without claiming file-content semantics", () => {
    const imported = importOpenSpecFiles({
      ...common,
      sourceRole: "primary",
      files: [
        {
          documentId: "current.auth",
          path: "openspec/specs/context-injection/spec.md",
          content: fixture("current-spec-v1.6.0.md.fixture"),
          kind: "current-specification",
        },
      ],
    });

    expect(imported.snapshot).toMatchObject({ role: "primary", authority: "authoritative" });
    expect(imported.operation).toMatchObject({
      operation: "observe-native-source",
      disposition: "supported",
      diagnostics: [
        expect.objectContaining({
          code: "openspec.file-content-uninterpreted",
          impact: "advisory",
        }),
      ],
    });
    expect(Object.isFrozen(imported)).toBe(true);
    expect(Object.isFrozen(imported.snapshot.documents[0]?.content)).toBe(true);
  });

  test("requires primary, overlay, and reference material to be separate sources", () => {
    expect(() =>
      importOpenSpecFiles({
        ...common,
        sourceRole: "reference",
        files: [
          {
            documentId: "delta.auth",
            path: "openspec/changes/add-auth/specs/authentication/spec.md",
            content: fixture("current-spec-v1.6.0.md.fixture"),
            kind: "change-delta",
          },
        ],
      }),
    ).toThrow("separate source observations");

    expect(() =>
      importOpenSpecFiles({
        ...common,
        sourceRole: "primary",
        files: [
          {
            documentId: "current.context",
            path: "openspec/specs/context-injection/spec.md",
            content: fixture("current-spec-v1.6.0.md.fixture"),
            kind: "current-specification",
          },
          {
            documentId: "delta.context",
            path: "openspec/changes/add-auth/specs/context-injection/spec.md",
            content: fixture("current-spec-v1.6.0.md.fixture"),
            kind: "change-delta",
          },
        ],
      }),
    ).toThrow("separate source observations");

    expect(
      importOpenSpecFiles({
        ...common,
        sourceId: "openspec.product-overlay",
        sourceRole: "overlay",
        files: [
          {
            documentId: "delta.context",
            path: "openspec/changes/add-auth/specs/context-injection/spec.md",
            content: fixture("current-spec-v1.6.0.md.fixture"),
            kind: "change-delta",
          },
        ],
      }).snapshot,
    ).toMatchObject({ role: "overlay", authority: "advisory" });

    const reference = importOpenSpecFiles({
      ...common,
      sourceId: "openspec.platform-reference",
      sourceRole: "reference",
      files: [
        {
          documentId: "reference.auth",
          path: "openspec/specs/context-injection/spec.md",
          content: fixture("current-spec-v1.6.0.md.fixture"),
          kind: "current-specification",
        },
      ],
    });
    expect(reference.snapshot).toMatchObject({ role: "reference", authority: "informative" });
  });

  test("validates status JSON and emits canonical workflow nodes and dependencies", () => {
    const stdout = fixture("status-v1.6.0.json");
    const imported = importOpenSpecStatusCli({ ...sourceStatus, stdout });
    const graph = imported.graph as {
      readonly nodes: readonly { readonly nodeId: string; readonly content: unknown }[];
      readonly relationships: readonly {
        readonly kind: string;
        readonly from: string;
        readonly to: string;
      }[];
    };

    expect(() => loadSpecification(imported.graph)).not.toThrow();
    expect(graph.nodes).toHaveLength(4);
    expect(graph.relationships).toHaveLength(4);
    expect(graph.relationships.every((relationship) => relationship.kind === "depends-on")).toBe(
      true,
    );
    const titles = new Map(graph.nodes.map((node) => [node.nodeId, node.content]));
    expect(
      graph.relationships.map((relationship) => [
        titles.get(relationship.from),
        titles.get(relationship.to),
      ]),
    ).toEqual([
      [
        expect.objectContaining({ id: "design", status: "ready" }),
        expect.objectContaining({ id: "proposal", status: "done" }),
      ],
      [
        expect.objectContaining({ id: "specs", status: "ready" }),
        expect.objectContaining({ id: "proposal", status: "done" }),
      ],
      [
        expect.objectContaining({ id: "tasks", status: "blocked" }),
        expect.objectContaining({ id: "specs", status: "ready" }),
      ],
      [
        expect.objectContaining({ id: "tasks", status: "blocked" }),
        expect.objectContaining({ id: "design", status: "ready" }),
      ],
    ]);
    expect(imported.operation).toMatchObject({
      operation: "derive-portable-specification",
      disposition: "supported",
      diagnostics: [],
    });
    expect(Object.isFrozen(graph.nodes[0])).toBe(true);
  });

  test("accepts skipped artifacts and preserves their declared dependency edges", () => {
    const imported = importOpenSpecStatusCli({
      ...sourceStatus,
      stdout: fixture("status-skip-specs-v1.6.0.json"),
    });
    const graph = imported.graph as {
      readonly nodes: readonly {
        readonly content: { readonly id: string; readonly status: string };
      }[];
      readonly relationships: readonly { readonly from: string; readonly to: string }[];
    };

    expect(() => loadSpecification(imported.graph)).not.toThrow();
    expect(graph.nodes.find((node) => node.content.id === "specs")?.content.status).toBe("skipped");
    expect(graph.relationships).toHaveLength(4);
  });

  test("imports official npm status without inventing unavailable dependency edges", () => {
    const imported = importOpenSpecStatusCli({
      ...npmStatus,
      stdout: fixture("status-npm-tarball-v1.6.0.json"),
    });
    const graph = imported.graph as {
      readonly sources: readonly {
        readonly extensions: Record<string, { readonly contract: string }>;
      }[];
      readonly nodes: readonly {
        readonly content: { readonly id: string; readonly missingDeps?: readonly string[] };
      }[];
      readonly relationships: readonly unknown[];
    };

    expect(() => loadSpecification(imported.graph)).not.toThrow();
    expect(graph.nodes).toHaveLength(4);
    expect(graph.relationships).toEqual([]);
    expect(graph.nodes.find((node) => node.content.id === "tasks")?.content.missingDeps).toEqual([
      "design",
      "specs",
    ]);
    expect(graph.sources[0]?.extensions["io.github.fission-ai.openspec"]?.contract).toBe(
      OPENSPEC_NPM_STATUS_CONTRACT,
    );
    expect(imported.operation).toMatchObject({
      operation: "derive-portable-specification",
      disposition: "supported",
      diagnostics: [
        expect.objectContaining({
          code: "openspec.status-dependencies-unavailable",
          impact: "advisory",
        }),
      ],
    });
  });

  test("requires the declared runtime contract to match the captured artifact shape", () => {
    expect(() =>
      importOpenSpecStatusCli({
        ...npmStatus,
        stdout: fixture("status-v1.6.0.json"),
      }),
    ).toThrow(OPENSPEC_NPM_STATUS_CONTRACT);
    expect(() =>
      importOpenSpecStatusCli({
        ...sourceStatus,
        stdout: fixture("status-npm-tarball-v1.6.0.json"),
      }),
    ).toThrow(OPENSPEC_SOURCE_STATUS_CONTRACT);
  });

  test("requires dependency lists on every artifact and validates their references", () => {
    const payload = JSON.parse(fixture("status-v1.6.0.json")) as {
      artifacts: { id: string; status: string; requires?: string[]; missingDeps?: string[] }[];
    };
    const proposal = payload.artifacts.find((artifact) => artifact.id === "proposal")!;
    delete proposal.requires;
    expect(() =>
      importOpenSpecStatusCli({ ...sourceStatus, stdout: JSON.stringify(payload) }),
    ).toThrow(OPENSPEC_SOURCE_STATUS_CONTRACT);

    proposal.requires = ["unknown"];
    expect(() =>
      importOpenSpecStatusCli({ ...sourceStatus, stdout: JSON.stringify(payload) }),
    ).toThrow("internally consistent");
  });

  test("allows missingDeps only on blocked artifacts and only for declared requirements", () => {
    const payload = JSON.parse(fixture("status-v1.6.0.json")) as {
      artifacts: { id: string; status: string; requires: string[]; missingDeps?: string[] }[];
    };
    const design = payload.artifacts.find((artifact) => artifact.id === "design")!;
    design.missingDeps = ["proposal"];
    expect(() =>
      importOpenSpecStatusCli({ ...sourceStatus, stdout: JSON.stringify(payload) }),
    ).toThrow("only on blocked artifacts");

    delete design.missingDeps;
    const tasks = payload.artifacts.find((artifact) => artifact.id === "tasks")!;
    tasks.missingDeps = ["proposal"];
    expect(() =>
      importOpenSpecStatusCli({ ...sourceStatus, stdout: JSON.stringify(payload) }),
    ).toThrow("internally consistent");
  });

  test("requires blocked missingDeps to exactly identify unresolved requires", () => {
    const payload = JSON.parse(fixture("status-v1.6.0.json")) as {
      artifacts: { id: string; status: string; requires: string[]; missingDeps?: string[] }[];
    };
    const tasks = payload.artifacts.find((artifact) => artifact.id === "tasks")!;
    tasks.missingDeps = ["design"];
    expect(() =>
      importOpenSpecStatusCli({ ...sourceStatus, stdout: JSON.stringify(payload) }),
    ).toThrow("status dependencies");

    tasks.missingDeps = ["specs", "design"];
    expect(() =>
      importOpenSpecStatusCli({ ...sourceStatus, stdout: JSON.stringify(payload) }),
    ).toThrow("status dependencies");
  });

  test("rejects cyclic requirement edges that the documented schema cannot emit", () => {
    const payload = JSON.parse(fixture("status-v1.6.0.json")) as {
      artifacts: { id: string; status: string; requires: string[]; missingDeps?: string[] }[];
    };
    const proposal = payload.artifacts.find((artifact) => artifact.id === "proposal")!;
    proposal.requires = ["tasks"];
    expect(() =>
      importOpenSpecStatusCli({ ...sourceStatus, stdout: JSON.stringify(payload) }),
    ).toThrow("acyclic");
  });

  test("rejects malformed contracts and duplicate identities", () => {
    expect(() => importOpenSpecStatusCli({ ...sourceStatus, stdout: '{"artifacts":[]}' })).toThrow(
      "documented 1.6.0 contract",
    );
    expect(() =>
      importOpenSpecFiles({
        ...common,
        sourceRole: "primary",
        files: [
          {
            documentId: "same",
            path: "openspec/specs/a/spec.md",
            content: "# A",
            kind: "current-specification",
          },
          {
            documentId: "same",
            path: "openspec/specs/b/spec.md",
            content: "# B",
            kind: "current-specification",
          },
        ],
      }),
    ).toThrow("document IDs must be unique");
  });

  test("binds support evidence to exact immutable fixture bytes", () => {
    expect(OPENSPEC_FILE_SUPPORT).toMatchObject({
      revision: "19d41714c8b790488732687443713e406ef5aeef",
    });
    expect(OPENSPEC_SOURCE_STATUS_CLI_SUPPORT).toMatchObject({
      revision: OPENSPEC_SOURCE_STATUS_CONTRACT,
    });
    expect(OPENSPEC_NPM_STATUS_CLI_SUPPORT).toMatchObject({
      revision: OPENSPEC_NPM_STATUS_CONTRACT,
    });
    expect(
      supportedOperation(OPENSPEC_FILE_SUPPORT, "observe-native-source").fixtures[0]?.digest.value,
    ).toBe(hash(fixture("current-spec-v1.6.0.md.fixture")));
    expect(
      supportedOperation(OPENSPEC_SOURCE_STATUS_CLI_SUPPORT, "derive-portable-specification")
        .fixtures[0]?.digest.value,
    ).toBe(hash(fixture("status-v1.6.0.json")));
    expect(
      supportedOperation(OPENSPEC_SOURCE_STATUS_CLI_SUPPORT, "derive-portable-specification")
        .fixtures[1]?.digest.value,
    ).toBe(hash(fixture("status-skip-specs-v1.6.0.json")));
    expect(
      supportedOperation(OPENSPEC_NPM_STATUS_CLI_SUPPORT, "derive-portable-specification")
        .fixtures[0]?.digest.value,
    ).toBe(hash(fixture("status-npm-tarball-v1.6.0.json")));
    expect(OPENSPEC_FILE_SUPPORT.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "derive-portable-specification",
          disposition: "unsupported",
        }),
        expect.objectContaining({
          operation: "round-trip-native-source",
          disposition: "unsupported",
        }),
      ]),
    );
  });
});
