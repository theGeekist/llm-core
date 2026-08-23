export interface QualityGateConfiguration {
  readonly branch: string;
  readonly history: {
    readonly blockDeletions: boolean;
    readonly blockForcePushes: boolean;
    readonly requireLinearHistory: boolean;
  };
  readonly pullRequest: {
    readonly required: boolean;
    readonly requireConversationResolution: boolean;
  };
  readonly requiredChecks: readonly string[];
  readonly schemaVersion: 1;
}

const actionSegment = /^[A-Za-z0-9_.-]+$/;
const actionSha = /^[a-f0-9]{40}$/;

const immutableAction = (reference: string): boolean => {
  const [path, revision, extra] = reference.split("@");
  const segments = path?.split("/") ?? [];
  return (
    extra === undefined &&
    segments.length >= 2 &&
    segments.every((segment) => actionSegment.test(segment)) &&
    actionSha.test(revision ?? "")
  );
};

const actionReferenceFromLine = (line: string): string | undefined => {
  const trimmed = line.trimStart();
  const step = trimmed.startsWith("- ") ? trimmed.slice(2).trimStart() : trimmed;
  if (!step.startsWith("uses:")) return undefined;

  const value = step.slice("uses:".length).trimStart();
  let end = value.length;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "#" || character === " " || character === "\t") {
      end = index;
      break;
    }
  }
  return value.slice(0, end);
};

export const actionReferences = (workflow: string): readonly string[] =>
  workflow
    .split("\n")
    .map(actionReferenceFromLine)
    .filter((reference): reference is string => reference !== undefined && reference.length > 0);

export const validateActionReferences = (path: string, workflow: string): readonly string[] =>
  actionReferences(workflow)
    .filter((reference) => !reference.startsWith("./") && !immutableAction(reference))
    .map((reference) => `${path} uses mutable or invalid action reference ${reference}`);

const validateRepositoryPolicy = (configuration: QualityGateConfiguration): readonly string[] => {
  const errors: string[] = [];
  if (configuration.schemaVersion !== 1) errors.push("quality-gates schemaVersion must be 1");
  if (configuration.branch !== "main") errors.push("quality-gates branch must be main");
  if (!configuration.pullRequest.required) errors.push("pull requests must be required");
  if (!configuration.pullRequest.requireConversationResolution) {
    errors.push("review conversation resolution must be required");
  }
  if (!configuration.history.blockDeletions || !configuration.history.blockForcePushes) {
    errors.push("branch deletion and force pushes must be blocked");
  }
  if (!configuration.history.requireLinearHistory) {
    errors.push("linear history must be required");
  }
  return errors;
};

export const validateQualityGateConfiguration = (
  configuration: QualityGateConfiguration,
  workflowText: string,
): readonly string[] => [
  ...validateRepositoryPolicy(configuration),
  ...configuration.requiredChecks.flatMap((check) =>
    workflowText.includes(`name: ${check}`)
      ? []
      : [`required check ${check} has no exact workflow or job name`],
  ),
];

export const validateCiWorkflow = (workflow: string): readonly string[] => {
  const requiredFragments = [
    ["fetch-depth: 0", "CI must fetch Git history for trusted-base debt comparison"],
    [
      "QUALITY_BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}",
      "CI must bind lint debt to the pull-request base or push-before commit",
    ],
  ] as const;
  const errors = requiredFragments.flatMap(([fragment, error]) =>
    workflow.includes(fragment) ? [] : [error],
  );
  const lines = workflow.split("\n").map((line) => line.trim());
  const containsSequence = (sequence: readonly string[]): boolean =>
    lines.some((_, index) => sequence.every((line, offset) => lines[index + offset] === line));
  if (!containsSequence(["- name: Upload coverage", "if: github.event_name == 'push'"])) {
    errors.push("Codecov credentials must be restricted to main-push evidence");
  }
  if (!containsSequence(["sonarqube:", "name: SonarQube", "if: github.event_name == 'push'"])) {
    errors.push("SonarQube credentials must be restricted to main-push evidence");
  }
  return errors;
};
