import { describe, expect, test } from "bun:test";
import { parseSpecKitWorkflow } from "../../../src/adapters/spec-kit/public";
import { parseSpecKitWorkflowYaml } from "../../../src/adapters/spec-kit/yaml";
import { exactSpecKitPython, fixture, importedFiles, provenance } from "./spec-kit-test-fixtures";

describe("Spec Kit adapter", () => {
  test("derives exact, partial, and rejected fidelity from issue dispositions", () => {
    const exact = importedFiles([
      {
        path: "workflows/speckit/workflow.yml",
        content: fixture("workflow-core-c0fe0e4.yml"),
        kind: "workflow",
        provenance: provenance("core", "speckit", 0),
      },
    ]);
    expect(exact.report).toMatchObject({
      fidelity: "exact",
      issues: [expect.objectContaining({ disposition: "preserved" })],
    });

    const partial = importedFiles([
      {
        path: ".specify/workflows/runs/run-1/state.json",
        content: '{"status":"paused"}',
        kind: "workflow-state",
        provenance: provenance("workflow-run", "run-1", 0),
      },
    ]);
    expect(partial.report).toMatchObject({
      fidelity: "partial",
      issues: [expect.objectContaining({ disposition: "degraded" })],
    });

    const rejected = importedFiles([
      {
        path: "workflows/invalid.yml",
        content: 'schema_version: "2.0"\nworkflow: nope\nsteps: []\n',
        kind: "workflow",
        provenance: provenance("core", "speckit", 0),
      },
    ]);
    expect(rejected.report).toMatchObject({
      fidelity: "rejected",
      issues: expect.arrayContaining([expect.objectContaining({ disposition: "rejected" })]),
    });
  });

  test("degrades custom extension steps while retaining their complete native definition", () => {
    const parsed = parseSpecKitWorkflow(`
schema_version: "1.0"
workflow:
  id: "custom"
  name: "Custom"
  version: "1.0.0"
steps:
  - id: deploy
    type: acme-deploy
    environment: production
`);
    expect(parsed.issues).toEqual([
      expect.objectContaining({
        code: "spec-kit-workflow-custom-step-uninterpreted",
        disposition: "degraded",
      }),
      expect.objectContaining({ disposition: "preserved" }),
    ]);
    expect(parsed.program?.steps[0]?.definition).toEqual({
      id: "deploy",
      type: "acme-deploy",
      environment: "production",
    });
  });

  test("rejects workflow shapes rejected by the pinned c0fe0e43 validators", () => {
    const invalidFragments = [
      `requires:\n  permissions: [shell]\nsteps:\n  - id: run\n    type: shell\n    run: echo ok`,
      `inputs:\n  count:\n    type: number\n    default: nope\nsteps:\n  - id: run\n    type: shell\n    run: echo ok`,
      `steps:\n  - id: review\n    type: gate\n    options: [approve, reject]`,
      `steps:\n  - id: review\n    type: gate\n    message: Review\n    options: [approve]\n    on_reject: retry`,
      `steps:\n  - id: dispatch\n    command: speckit.plan\n    input: [not, a, mapping]`,
      `steps:\n  - id: run\n    type: shell\n    run: echo ok\n    timeout: true`,
    ];

    invalidFragments.forEach((fragment) => {
      const parsed = parseSpecKitWorkflow(`
schema_version: "1.0"
workflow:
  id: "invalid-proof"
  name: "Invalid Proof"
  version: "1.0.0"
${fragment}
`);
      expect(parsed.program).toBeUndefined();
      expect(parsed.issues.some((issue) => issue.disposition === "rejected")).toBe(true);
    });
  });

  test("matches qualified PyYAML scalar values and rejects silent scalar divergence", () => {
    const yes = parseSpecKitWorkflow(`
schema_version: "1.0"
workflow: { id: yaml-yes, name: YAML Yes, version: "1.0.0" }
inputs:
  approved: { type: boolean, default: yes }
steps:
  - { id: run, type: shell, run: echo }
`);
    const no = parseSpecKitWorkflow(`
schema_version: "1.0"
workflow: { id: yaml-no, name: YAML No, version: "1.0.0" }
inputs:
  approved: { type: boolean, default: NO }
steps:
  - { id: run, type: shell, run: echo }
`);
    expect(
      (yes.program?.definition.inputs as { approved: { default: unknown } }).approved.default,
    ).toBe(true);
    expect(
      (no.program?.definition.inputs as { approved: { default: unknown } }).approved.default,
    ).toBe(false);
    expect(parseSpecKitWorkflowYaml("value: .5")).toEqual({ value: 0.5 });
    expect(parseSpecKitWorkflowYaml("value: -.5")).toEqual({ value: "-.5" });
    expect(parseSpecKitWorkflowYaml("value: 08")).toEqual({ value: "08" });
    ["value: 9007199254740993", "value: 2026-08-02", "value: 12:34", "value: .inf"].forEach(
      (content) => expect(() => parseSpecKitWorkflowYaml(content)).toThrow(),
    );

    const numericSchema = parseSpecKitWorkflow(`
schema_version: 1.0
workflow: { id: numeric-schema, name: Numeric Schema, version: "1.0.0" }
steps:
  - { id: run, type: shell, run: echo }
`);
    expect(numericSchema.program).toBeUndefined();
    expect(numericSchema.issues).toContainEqual(
      expect.objectContaining({ disposition: "rejected", location: "/schema_version" }),
    );
  });

  test.skipIf(!exactSpecKitPython)(
    "differentially matches or rejects exact pinned PyYAML safe_load scalar resolution",
    () => {
      const cases = [
        ...[
          "null",
          "~",
          "yes",
          "ON",
          "false",
          "off",
          "0",
          "-0",
          "+12",
          "1_2",
          "012",
          "0b10",
          "0x10",
          "0.5",
          ".5",
          "1.",
          "1_000.5",
          ".5e+2",
          "1.0e+1_0",
          ".5e+1_0",
          "-.5",
          "+.5",
          "08",
          "0o12",
          "1e+2",
          "plain",
          "'yes'",
          '"yes"',
        ].map((scalar) => ({ scalar, disposition: "match" as const })),
        ...[
          "9007199254740993",
          "0x20000000000001",
          "12:34",
          "1:20.5",
          "2026-08-02",
          "2026-08-02T12:34:56Z",
          ".inf",
          "-.Inf",
          ".nan",
        ].map((scalar) => ({ scalar, disposition: "reject" as const })),
      ];
      const python = String.raw`
import datetime, json, math, sys, yaml

def encode(value):
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return {"kind": "value", "value": value}
    if isinstance(value, int):
        return {"kind": "integer", "decimal": str(value)}
    if isinstance(value, float) and math.isfinite(value):
        return {"kind": "float", "value": value}
    if isinstance(value, float):
        return {"kind": "non-finite"}
    if isinstance(value, (datetime.date, datetime.datetime)):
        return {"kind": "timestamp"}
    return {"kind": type(value).__name__}

scalars = json.loads(sys.argv[1])
print(json.dumps({
    "version": yaml.__version__,
    "values": [encode(yaml.safe_load("value: " + scalar)["value"]) for scalar in scalars],
}))
`;
      const differential = Bun.spawnSync([
        exactSpecKitPython!,
        "-c",
        python,
        JSON.stringify(cases.map(({ scalar }) => scalar)),
      ]);
      expect(differential.stderr.toString()).toBe("");
      expect(differential.exitCode).toBe(0);
      const native = JSON.parse(differential.stdout.toString()) as {
        version: string;
        values: Array<
          | { kind: "value"; value: string | number | boolean | null }
          | { kind: "integer"; decimal: string }
          | { kind: "float"; value: number }
          | { kind: "non-finite" | "timestamp" }
        >;
      };
      expect(native.version).toBe("6.0.3");
      cases.forEach(({ scalar, disposition }, index) => {
        const expected = native.values[index]!;
        if (disposition === "reject") {
          expect(() => parseSpecKitWorkflowYaml(`value: ${scalar}`)).toThrow();
          return;
        }
        const actual = parseSpecKitWorkflowYaml(`value: ${scalar}`).value;
        if (expected.kind === "integer") {
          expect(actual).toBe(Number(expected.decimal));
        } else {
          expect(expected.kind === "value" || expected.kind === "float").toBe(true);
          expect(actual).toBe("value" in expected ? expected.value : undefined);
        }
      });
    },
  );
});
