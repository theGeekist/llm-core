import { describe, expect, test } from "bun:test";

import {
  validateActionReferences,
  validateCiWorkflow,
  validateQualityGateConfiguration,
  type QualityGateConfiguration,
} from "./github-quality-policy";

const configuration: QualityGateConfiguration = {
  schemaVersion: 1,
  branch: "main",
  requiredChecks: ["Quality"],
  pullRequest: {
    required: true,
    requireConversationResolution: true,
  },
  history: {
    blockDeletions: true,
    blockForcePushes: true,
    requireLinearHistory: true,
  },
};

describe("GitHub quality policy", () => {
  test("rejects mutable action tags", () => {
    expect(
      validateActionReferences(
        "ci.yml",
        "    uses: actions/checkout@v4 # mutable\n      - uses: actions/setup-node@v4\n",
      ),
    ).toEqual([
      "ci.yml uses mutable or invalid action reference actions/checkout@v4",
      "ci.yml uses mutable or invalid action reference actions/setup-node@v4",
    ]);
  });

  test("accepts immutable action commits and exact required check names", () => {
    const sha = "a".repeat(40);
    expect(validateActionReferences("ci.yml", `    uses: actions/checkout@${sha}\n`)).toEqual([]);
    expect(
      validateQualityGateConfiguration(configuration, "jobs:\n  quality:\n    name: Quality\n"),
    ).toEqual([]);
  });

  test("binds CI debt checks to trusted Git history", () => {
    const workflow = `
steps:
  - with:
      fetch-depth: 0
  - env:
      QUALITY_BASE_SHA: \${{ github.event.pull_request.base.sha || github.event.before }}
  - name: Upload coverage
    if: github.event_name == 'push'
sonarqube:
  name: SonarQube
  if: github.event_name == 'push'
`;
    expect(validateCiWorkflow(workflow)).toEqual([]);
    expect(validateCiWorkflow(workflow.replace("fetch-depth: 0", "fetch-depth: 1"))).toContain(
      "CI must fetch Git history for trusted-base debt comparison",
    );
    expect(validateCiWorkflow(workflow.replace("github.event.before", "github.sha"))).toContain(
      "CI must bind lint debt to the pull-request base or push-before commit",
    );
    expect(
      validateCiWorkflow(workflow.replace("if: github.event_name == 'push'", "if: always()")),
    ).toContain("Codecov credentials must be restricted to main-push evidence");
  });

  test("rejects weakened repository policy", () => {
    const invalid = {
      ...configuration,
      branch: "develop",
      schemaVersion: 2,
      pullRequest: {
        required: false,
        requireConversationResolution: false,
      },
      history: {
        blockDeletions: false,
        blockForcePushes: false,
        requireLinearHistory: false,
      },
    } as unknown as QualityGateConfiguration;

    expect(validateQualityGateConfiguration(invalid, "name: Quality\n")).toEqual([
      "quality-gates schemaVersion must be 1",
      "quality-gates branch must be main",
      "pull requests must be required",
      "review conversation resolution must be required",
      "branch deletion and force pushes must be blocked",
      "linear history must be required",
    ]);
  });

  test("treats review as process evidence rather than a required check", () => {
    expect(validateQualityGateConfiguration(configuration, "name: Quality\n")).toEqual([]);
    expect(JSON.stringify(configuration)).not.toContain("Independent review");
    expect(JSON.stringify(configuration)).not.toContain("requiredApprovals");
  });
});
