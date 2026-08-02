import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { contractVersion } from "#contracts";
import { loadSpecification } from "../../../src/specifications/index";
import {
  BMAD_CLI_SUPPORT,
  BMAD_FILE_SUPPORT,
  importBmadFiles,
  observeBmadCli,
  type BmadCliObservationInput,
  type BmadFileImportInput,
} from "../../../src/adapters/bmad/index";

const observedAt = "2026-08-02T06:07:24.000Z";

const fixtureBytes = (name: string): Buffer =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

const fixture = (name: string): string => fixtureBytes(name).toString("utf8");

const hash = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");

const input = (revision = "bb45db4"): BmadFileImportInput => ({
  version: contractVersion("6.10.0"),
  sourceId: "bmad.payment-service",
  revision,
  observedAt,
  artifacts: [
    { path: "SPEC.md", content: "# Payment specification" },
    {
      path: "_bmad-output/.memlog.md",
      content: fixture("memlog-v6.10.0.md"),
    },
    {
      path: "_bmad-output/bmad-dev-auto-result-payments.md",
      content: fixture("dev-auto-blocked-v6.10.0.md"),
    },
    {
      path: "_bmad-output/sprint-status.yaml",
      content: "development_status:\n  1-1-payment: in-progress\n",
    },
  ],
});

const graphOf = (value: ReturnType<typeof importBmadFiles>) =>
  value.graph as {
    readonly sources: readonly {
      readonly contentDigest: unknown;
      readonly extensions: Readonly<Record<string, unknown>>;
      readonly documents: readonly { readonly documentId: string; readonly content: unknown }[];
    }[];
    readonly nodes: readonly {
      readonly nodeId: string;
      readonly kind: string;
      readonly source: { readonly documentId: string; readonly location?: string };
      readonly content: Readonly<Record<string, unknown>>;
      readonly extensions?: Readonly<Record<string, unknown>>;
    }[];
    readonly report: {
      readonly fidelity: string;
      readonly issues: readonly {
        readonly code: string;
        readonly explanation: string;
        readonly source?: { readonly documentId?: string };
      }[];
    };
  };

describe("BMAD adapter", () => {
  test("declares only pinned file semantics and the qualified version invocation", () => {
    expect(String(BMAD_FILE_SUPPORT.format.id)).toBe("io.github.bmad-code-org.file");
    expect(BMAD_FILE_SUPPORT).toMatchObject({
      levels: ["syntax", "semantic"],
      sourceOwnership: "source-owned",
      writeBack: "unsupported",
    });
    expect(BMAD_FILE_SUPPORT.features).toContain("memlog-v6.10.0-record-observation");
    expect(BMAD_FILE_SUPPORT.features).toContain(
      "dev-auto-v6.10.0-frontmatter-and-result-observation",
    );
    expect(String(BMAD_CLI_SUPPORT.format.id)).toBe("io.github.bmad-code-org.cli");
    expect(BMAD_CLI_SUPPORT.features).toEqual(["bmad-version-command-observation"]);
  });

  test("parses pinned memlog bytes and Dev Auto frontmatter/result bytes", () => {
    const imported = importBmadFiles(input());
    const graph = graphOf(imported);
    const specification = loadSpecification(imported.graph);
    const extension = specification.sources[0]?.extensions?.[
      "io.github.bmad-code-org"
    ] as unknown as {
      readonly memlogs: readonly {
        readonly frontmatter: Readonly<Record<string, string>>;
        readonly records: readonly { readonly raw: string }[];
      }[];
    };
    const memoryNodes = graph.nodes.filter(
      (node) => node.source.documentId === "_bmad-output/.memlog.md" && node.source.location,
    );

    expect(memoryNodes).toHaveLength(9);
    expect(extension.memlogs[0]?.frontmatter).toEqual({
      topic: "Onboarding flow for a budgeting app",
      goal: "lift week-1 retention",
      updated: "2026-06-07T14:22",
    });
    expect(extension.memlogs[0]?.records[0]?.raw).toBe(
      "- (note) user picked techniques: SCAMPER, then Six Thinking Hats",
    );
    expect(memoryNodes[0]?.source.location).toBe("body entry 1");
    expect(memoryNodes[0]?.content).toMatchObject({
      bodyOrdinal: 1,
      type: "note",
      text: "user picked techniques: SCAMPER, then Six Thinking Hats",
    });
    expect(memoryNodes[7]?.content).toMatchObject({
      bodyOrdinal: 8,
      type: "decision",
      text: "lead with one pre-categorized account; defer multi-account import",
    });
    expect(specification.sources[0]?.extensions).toMatchObject({
      "io.github.bmad-code-org": {
        outcomes: [
          {
            status: "blocked",
            artifactPath: "_bmad-output/bmad-dev-auto-result-payments.md",
            blockingCondition: "intent gap",
            reviewLoopIteration: 2,
          },
        ],
      },
    });
    expect(
      graph.sources[0]?.documents.find(({ documentId }) => documentId === "_bmad-output/.memlog.md")
        ?.content,
    ).toEqual({ path: "_bmad-output/.memlog.md", text: fixture("memlog-v6.10.0.md") });
    expect(graph.report.fidelity).toBe("partial");
    expect(graph.report.issues.map((issue) => issue.code)).toContain(
      "bmad-blocked-outcome-preserved",
    );
  });

  test("rejects contradictory current results instead of accepting done and blocked", () => {
    const contradictory = fixture("dev-auto-blocked-v6.10.0.md").replace(
      "status: blocked",
      "status: done\nfinal_revision: abc123",
    );
    expect(() =>
      importBmadFiles({
        ...input(),
        artifacts: input().artifacts.map((artifact) =>
          artifact.path.includes("dev-auto-result")
            ? { ...artifact, content: contradictory }
            : artifact,
        ),
      }),
    ).toThrow("contradicts its current frontmatter status");
  });

  test("requires the real fallback result heading and rejects duplicate result sections", () => {
    const fallback = fixture("dev-auto-blocked-v6.10.0.md");
    const withoutHeading = fallback.replace("# BMad Dev Auto Result\n\n", "");
    const duplicateResult = `${fallback}\n# BMad Dev Auto Result\n\nStatus: done\n`;
    const replaceResult = (content: string): BmadFileImportInput => ({
      ...input(),
      artifacts: input().artifacts.map((artifact) =>
        artifact.path.includes("dev-auto-result") ? { ...artifact, content } : artifact,
      ),
    });

    expect(() => importBmadFiles(replaceResult(withoutHeading))).toThrow(
      "requires one Auto Run Result",
    );
    expect(() => importBmadFiles(replaceResult(duplicateResult))).toThrow(
      "duplicate result sections",
    );
  });

  test("reports every deliberately unparsed convention without inventing source status", () => {
    const graph = graphOf(importBmadFiles(input()));
    const unparsed = graph.report.issues.filter(
      (issue) => issue.code === "bmad-unparsed-convention-preserved",
    );
    expect(unparsed).toHaveLength(input().artifacts.length);
    expect(
      unparsed.find((issue) => issue.source?.documentId?.endsWith("sprint-status.yaml")),
    ).toMatchObject({
      explanation: expect.stringContaining("sprint-status YAML keys and lifecycle semantics"),
    });
    expect(graph.report.fidelity).toBe("partial");
  });

  test("uses source path identities and body ordinals unaffected by frontmatter shifts", () => {
    const first = graphOf(importBmadFiles(input()));
    const shiftedInput: BmadFileImportInput = {
      ...input("bb45db5"),
      artifacts: input("bb45db5").artifacts.map((artifact) =>
        artifact.path.endsWith(".memlog.md")
          ? {
              ...artifact,
              content: artifact.content.replace(
                "goal: lift week-1 retention\n",
                "goal: lift week-1 retention\naudience: new customers\n",
              ),
            }
          : artifact,
      ),
    };
    const second = graphOf(importBmadFiles(shiftedInput));
    const memoryIds = (graph: ReturnType<typeof graphOf>) =>
      graph.nodes
        .filter((node) => node.source.location?.startsWith("body entry"))
        .map((node) => node.nodeId);

    expect(memoryIds(second)).toEqual(memoryIds(first));
    expect(new Set(first.nodes.map((node) => node.nodeId)).size).toBe(first.nodes.length);
    expect(
      first.nodes.every((node) =>
        /^bmad\.(artifact|memlog-record)\.[a-f0-9]{64}$/.test(node.nodeId),
      ),
    ).toBe(true);

    const collisionProbe = graphOf(
      importBmadFiles({
        ...input(),
        artifacts: [
          ...input().artifacts,
          { path: "_bmad-output/.memlog.md:line:1", content: "# Collision probe" },
        ],
      }),
    );
    expect(new Set(collisionProbe.nodes.map((node) => node.nodeId)).size).toBe(
      collisionProbe.nodes.length,
    );
  });

  test("detects normal Dev Auto story artifacts and parses every lifecycle state", () => {
    const lifecycle = [
      ["draft", ""],
      ["ready-for-dev", ""],
      ["in-progress", ""],
      ["in-review", ""],
      ["done", "baseline_revision: before\nfinal_revision: after\n"],
      ["blocked", ""],
    ] as const;
    const artifacts = lifecycle.map(([status, revisions], index) => ({
      path: `epic/stories/${index + 1}-${status}.md`,
      content: `---\nstatus: ${status}\nreview_loop_iteration: ${status === "blocked" ? 2 : 0}\n${revisions}---\n\n<intent-contract>\nintent\n</intent-contract>\n${
        status === "done" || status === "blocked"
          ? `\n## Auto Run Result\n\nStatus: ${status}\n${status === "blocked" ? "Blocking condition: intent gap\n" : ""}`
          : ""
      }`,
    }));
    const imported = importBmadFiles({
      ...input(),
      artifacts,
    });
    const graph = graphOf(imported);
    const specification = loadSpecification(imported.graph);
    const extension = specification.sources[0]?.extensions?.[
      "io.github.bmad-code-org"
    ] as unknown as {
      readonly outcomes: readonly { readonly status: string; readonly artifactPath: string }[];
    };

    expect(extension.outcomes.map(({ status }) => status)).toEqual(
      lifecycle.map(([status]) => status),
    );
    expect(graph.nodes.every(({ kind }) => kind === "plan")).toBe(true);
    expect(extension.outcomes.map(({ artifactPath }) => artifactPath)).toEqual(
      artifacts.map(({ path }) => path),
    );
  });

  test("enforces terminal revisions, one result section, and exact repair-loop bounds", () => {
    const story = (frontmatter: string, result = "") => ({
      path: "epic/stories/1-payment.md",
      content: `---\n${frontmatter}---\n\n<intent-contract>\npayment intent\n</intent-contract>\n${result}`,
    });
    const importStory = (artifact: ReturnType<typeof story>) =>
      importBmadFiles({ ...input(), artifacts: [artifact] });
    const doneResult = "\n## Auto Run Result\n\nStatus: done\n";
    const nonConvergenceResult =
      "\n## Auto Run Result\n\nStatus: blocked\nBlocking condition: review repair loop exceeded 5 iterations (non-convergence)\n";

    expect(() =>
      importStory(story("status: done\nbaseline_revision: before\nfinal_revision: after\n")),
    ).toThrow("requires one Auto Run Result");
    expect(() =>
      importStory(
        story(
          "status: done\nbaseline_revision: before\nfinal_revision: after\n",
          `${doneResult}\n## Auto Run Result\n\nStatus: done\n`,
        ),
      ),
    ).toThrow("duplicate result sections");
    expect(() => importStory(story("status: done\nfinal_revision: after\n", doneResult))).toThrow(
      "baseline_revision and final_revision",
    );
    expect(() =>
      importStory(story("status: blocked\nreview_loop_iteration: 5\n", nonConvergenceResult)),
    ).toThrow("requires review loop 6");
    expect(() =>
      importStory(
        story(
          "status: blocked\nreview_loop_iteration: 6\n",
          "\n## Auto Run Result\n\nStatus: blocked\nBlocking condition: intent gap\n",
        ),
      ),
    ).toThrow("only at blocked non-convergence");
    expect(() => importStory(story("status: in-review\nreview_loop_iteration: 6\n"))).toThrow(
      "only at blocked non-convergence",
    );
    expect(() =>
      importStory(story("status: blocked\nreview_loop_iteration: 7\n", nonConvergenceResult)),
    ).toThrow("invalid review loop");
    expect(() =>
      importStory(story("status: blocked\nreview_loop_iteration: 6\n", nonConvergenceResult)),
    ).not.toThrow();
  });

  test("binds every support declaration to exact immutable fixture or evidence bytes", () => {
    const declaredBytes = new Map([
      ["bmad.file.memlog.v6.10.0", "memlog-v6.10.0.md"],
      ["bmad.file.dev-auto-blocked.v6.10.0", "dev-auto-blocked-v6.10.0.md"],
      ["bmad.profile.state-memory.bb45db4", "profile-evidence-bb45db4.md"],
      ["bmad.cli.version-stdout.v6.10.0", "cli-version-v6.10.0.txt"],
      ["bmad.cli-source.version.bb45db4", "cli-evidence-bb45db4.txt"],
    ]);
    const declarations = [
      ...BMAD_FILE_SUPPORT.fixtures.map(
        ({ fixtureId, digest }) => [fixtureId, digest.value] as const,
      ),
      ...BMAD_FILE_SUPPORT.evidence.map(
        ({ evidenceId, digest }) => [evidenceId, digest.value] as const,
      ),
      ...BMAD_CLI_SUPPORT.fixtures.map(
        ({ fixtureId, digest }) => [fixtureId, digest.value] as const,
      ),
      ...BMAD_CLI_SUPPORT.evidence.map(
        ({ evidenceId, digest }) => [evidenceId, digest.value] as const,
      ),
    ];

    expect(declarations).toHaveLength(declaredBytes.size);
    declarations.forEach(([id, declaredDigest]) => {
      const filename = declaredBytes.get(id);
      expect(filename).toBeDefined();
      expect(declaredDigest).toBe(hash(fixtureBytes(filename!)));
    });
  });

  test("validates the actual 6.10.0 version command, exit, output, and timestamp", () => {
    const cliInput: BmadCliObservationInput = {
      command: "bmad",
      argv: ["--version"] as const,
      exitCode: 0 as const,
      observedAt,
      stdout: fixture("cli-version-v6.10.0.txt"),
      stderr: "",
    };
    const observation = observeBmadCli(cliInput);
    expect(observation.version).toBe("6.10.0");
    expect(Object.isFrozen(observation.argv)).toBe(true);
    expect(() => observeBmadCli({ ...cliInput, argv: ["install"] as never })).toThrow(
      "limited to successful",
    );
    expect(() => observeBmadCli({ ...cliInput, exitCode: 1 as never })).toThrow(
      "limited to successful",
    );
    expect(() => observeBmadCli({ ...cliInput, observedAt: "not-a-time" })).toThrow("timestamp");
    expect(() => observeBmadCli({ ...cliInput, stdout: "bmad 6.10.0\n" })).toThrow(
      "--version output",
    );

    let getterCalls = 0;
    const hostile = Object.defineProperty({ ...cliInput }, "stdout", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "6.10.0\n";
      },
    });
    expect(() => observeBmadCli(hostile as BmadCliObservationInput)).toThrow("closed portable");
    expect(getterCalls).toBe(0);
  });

  test("captures the whole portable input before field access and deep-freezes the result", () => {
    let getterCalls = 0;
    const hostile = Object.defineProperty(
      {
        ...input(),
        artifacts: [...input().artifacts],
      },
      "sourceId",
      {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return "hostile";
        },
      },
    );
    expect(() => importBmadFiles(hostile as BmadFileImportInput)).toThrow("closed portable");
    expect(getterCalls).toBe(0);

    const hostileArtifact = Object.defineProperty(
      { path: "nested.md", content: "unused" },
      "content",
      {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return "# Nested hostile accessor";
        },
      },
    );
    expect(() =>
      importBmadFiles({
        ...input(),
        artifacts: [hostileArtifact] as BmadFileImportInput["artifacts"],
      }),
    ).toThrow("closed portable");
    expect(getterCalls).toBe(0);

    const mutable = input();
    const imported = importBmadFiles(mutable);
    const graph = graphOf(imported);
    const specification = loadSpecification(imported.graph);
    (mutable.artifacts as { path: string; content: string }[])[0]!.content = "mutated";

    expect(
      graph.sources[0]?.documents.find(({ documentId }) => documentId === "SPEC.md")?.content,
    ).toEqual({ path: "SPEC.md", text: "# Payment specification" });
    expect(Object.isFrozen(imported)).toBe(true);
    expect(Object.isFrozen(imported.graph)).toBe(true);
    expect(Object.isFrozen(graph.nodes)).toBe(true);
    expect(Object.isFrozen(graph.nodes[0])).toBe(true);
    expect(Object.isFrozen(graph.nodes[0]?.content)).toBe(true);
    expect(Object.isFrozen(graph.sources[0]?.documents)).toBe(true);
    expect(Object.isFrozen(graph.sources[0]?.extensions)).toBe(true);
    expect(Object.isFrozen(graph.report.issues)).toBe(true);
    expect(Object.isFrozen(imported.support)).toBe(true);
    expect(imported.support.every((support) => Object.isFrozen(support.features))).toBe(true);
    expect(Object.isFrozen(specification)).toBe(true);
  });
});
