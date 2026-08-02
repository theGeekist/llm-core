import { describe, expect, test } from "bun:test";
import { contractVersion } from "#contracts";
import { loadSpecification } from "../../../src/specifications/index";
import { importBmadFiles, type BmadFileImportInput } from "../../../src/adapters/bmad/index";

const observedAt = "2026-08-02T06:07:24.000Z";

const input = (revision = "bb45db4"): BmadFileImportInput => ({
  version: contractVersion("6.10.0"),
  sourceId: "bmad.payment-service",
  revision,
  observedAt,
  artifacts: [{ path: "placeholder.md", content: "" }],
});

const graphOf = (value: ReturnType<typeof importBmadFiles>) =>
  value.graph as {
    readonly sources: readonly {
      readonly contentDigest: unknown;
      readonly extensions: Readonly<Record<string, unknown>>;
    }[];
    readonly nodes: readonly {
      readonly nodeId: string;
      readonly kind: string;
    }[];
  };

describe("BMAD adapter identity and lifecycle invariants", () => {
  test("binds source digest to path/content and artifact identity to source/path", () => {
    const artifact = {
      path: "epic/stories/1-payment.md",
      content:
        "---\nstatus: in-review\nreview_loop_iteration: 3\n---\n\n<intent-contract>\npayment intent\n</intent-contract>\n",
    } as const;
    const withoutKind = graphOf(importBmadFiles({ ...input(), artifacts: [artifact] }));
    const withKind = graphOf(
      importBmadFiles({
        ...input("different-revision"),
        artifacts: [{ ...artifact, kind: "other" }],
      }),
    );
    const withChangedContent = graphOf(
      importBmadFiles({
        ...input(),
        artifacts: [
          {
            ...artifact,
            content: artifact.content.replace("payment intent", "revised payment intent"),
          },
        ],
      }),
    );
    const extensionOf = (graph: ReturnType<typeof graphOf>) =>
      graph.sources[0]?.extensions["io.github.bmad-code-org"] as {
        readonly outcomes: readonly unknown[];
      };

    expect(withKind.sources[0]?.contentDigest).toEqual(withoutKind.sources[0]?.contentDigest);
    expect(withKind.nodes[0]?.nodeId).toBe(withoutKind.nodes[0]?.nodeId);
    expect(withKind.nodes[0]?.kind).toBe("artifact");
    expect(withoutKind.nodes[0]?.kind).toBe("plan");
    expect(extensionOf(withKind).outcomes).toEqual(extensionOf(withoutKind).outcomes);
    expect(withChangedContent.nodes[0]?.nodeId).toBe(withoutKind.nodes[0]?.nodeId);
    expect(withChangedContent.sources[0]?.contentDigest).not.toEqual(
      withoutKind.sources[0]?.contentDigest,
    );

    const ordered = graphOf(
      importBmadFiles({
        ...input(),
        artifacts: [
          { path: "z.md", content: "z" },
          { path: "a.md", content: "a" },
        ],
      }),
    );
    const reversed = graphOf(
      importBmadFiles({
        ...input(),
        artifacts: [
          { path: "a.md", content: "a" },
          { path: "z.md", content: "z" },
        ],
      }),
    );
    expect(ordered.sources[0]?.contentDigest).toEqual(reversed.sources[0]?.contentDigest);
    expect(ordered.nodes.map(({ nodeId }) => nodeId)).toEqual(
      reversed.nodes.map(({ nodeId }) => nodeId),
    );

    const encodedA = graphOf(
      importBmadFiles({
        ...input(),
        sourceId: "source-a",
        artifacts: [{ path: "b:c", content: "" }],
      }),
    );
    const encodedB = graphOf(
      importBmadFiles({
        ...input(),
        sourceId: "source-a:b",
        artifacts: [{ path: "c", content: "" }],
      }),
    );
    expect(encodedA.nodes[0]?.nodeId).not.toBe(encodedB.nodes[0]?.nodeId);
  });

  test("accepts pinned transient stale results while coupling terminal results", () => {
    const staleResult = (status: "done" | "blocked", blockingCondition = "") => ({
      path: "epic/stories/1-payment.md",
      content: `---\nstatus: in-review\nreview_loop_iteration: 0\nbaseline_revision: before\nfinal_revision: after\n---\n\n<intent-contract>\nintent\n</intent-contract>\n\n## Auto Run Result\n\nStatus: ${status}\n${blockingCondition}`,
    });
    const outcomeFor = (artifact: ReturnType<typeof staleResult>) => {
      const specification = loadSpecification(
        importBmadFiles({ ...input(), artifacts: [artifact] }).graph,
      );
      const extension = specification.sources[0]?.extensions?.[
        "io.github.bmad-code-org"
      ] as unknown as { readonly outcomes: readonly Record<string, unknown>[] };
      return extension.outcomes[0];
    };

    expect(outcomeFor(staleResult("done"))).toMatchObject({ status: "in-review" });
    expect(outcomeFor(staleResult("blocked", "Blocking condition: intent gap\n"))).toEqual({
      status: "in-review",
      artifactPath: "epic/stories/1-payment.md",
      reviewLoopIteration: 0,
      baselineRevision: "before",
      finalRevision: "after",
    });

    const contradictoryTerminal = staleResult("done");
    contradictoryTerminal.content = contradictoryTerminal.content.replace(
      "status: in-review",
      "status: blocked",
    );
    expect(() => importBmadFiles({ ...input(), artifacts: [contradictoryTerminal] })).toThrow(
      "contradicts its current frontmatter status",
    );
  });
});
