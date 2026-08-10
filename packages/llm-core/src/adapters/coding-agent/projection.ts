import { sha256Evidence } from "./digest";
import { projectPinnedMessageEvents } from "./native-event";
import { snapshotPortable, type PortableValue } from "./portable-snapshot";
import { CodingAgentQualificationError } from "./qualification-error";
import {
  OPENHANDS_INSTALLED_CLOSURE_DIGEST,
  OPENHANDS_INSTALLED_PACKAGE_COUNT,
  OPENHANDS_LOCK_DIGEST,
  OPENHANDS_PROBE_DIGEST,
  OPENHANDS_QUALIFICATION_PROFILE,
} from "./support";
import type {
  CodingAgentArtifactEvidence,
  CodingAgentExecutableClosureEvidence,
  CodingAgentQualificationEvidence,
  CodingAgentSandboxEvidence,
} from "./types";
import { exactKeys, record, requiredString } from "./validation";

const MAX_TEXT_BYTES = 1_048_576;
const QUALIFIED_FIXTURE = Object.freeze({
  fixtureId: "governed-repository-change-v1",
  relativePath: "src/message.txt",
  before: "qualification pending\n",
  after: "qualification complete\n",
  patch:
    "--- a/src/message.txt\n+++ b/src/message.txt\n@@ -1 +1 @@\n-qualification pending\n+qualification complete\n",
});

interface QualifiedFixture {
  readonly fixtureId: string;
  readonly relativePath: string;
  readonly before: string;
  readonly after: string;
  readonly patch: string;
}

interface ArtifactInput {
  readonly kind: CodingAgentArtifactEvidence["kind"];
  readonly logicalPath: string;
  readonly mediaType: CodingAgentArtifactEvidence["mediaType"];
  readonly content: string;
}

const text = (value: PortableValue | undefined, label: string): string => {
  const candidate = requiredString(value, label);
  if (Buffer.byteLength(candidate) > MAX_TEXT_BYTES) {
    throw new CodingAgentQualificationError(
      "observation-too-large",
      `${label} exceeds the qualification limit.`,
    );
  }
  return candidate;
};

const artifact = (input: ArtifactInput): CodingAgentArtifactEvidence =>
  Object.freeze({
    kind: input.kind,
    logicalPath: input.logicalPath,
    mediaType: input.mediaType,
    digest: sha256Evidence(input.content),
    byteLength: Buffer.byteLength(input.content),
  });

const validateUpstream = (value: PortableValue): void => {
  const upstream = record(value, "upstream");
  exactKeys(upstream, ["name", "version", "revision"], "upstream");
  if (
    upstream.name !== OPENHANDS_QUALIFICATION_PROFILE.integration ||
    upstream.version !== OPENHANDS_QUALIFICATION_PROFILE.version ||
    upstream.revision !== OPENHANDS_QUALIFICATION_PROFILE.revision
  ) {
    throw new CodingAgentQualificationError(
      "unsupported-upstream-version",
      "Observation is not from the qualified OpenHands release.",
    );
  }
};

const validatePermissions = (value: PortableValue): void => {
  const permissions = record(value, "permissions");
  exactKeys(permissions, ["filesystem", "process", "network", "effects"], "permissions");
  const expected = OPENHANDS_QUALIFICATION_PROFILE.permissions;
  for (const key of ["filesystem", "process", "network", "effects"] as const) {
    if (
      !Array.isArray(permissions[key]) ||
      JSON.stringify(permissions[key]) !== JSON.stringify(expected[key])
    ) {
      throw new CodingAgentQualificationError(
        "permission-boundary-mismatch",
        `permissions.${key} does not match the qualified grant.`,
      );
    }
  }
};

const validatePath = (relativePath: string): void => {
  if (relativePath.startsWith("/") || relativePath.includes("..") || relativePath.includes("\\")) {
    throw new CodingAgentQualificationError(
      "invalid-logical-path",
      "Fixture path must be a safe workspace-relative POSIX path.",
    );
  }
};

const validateFixture = (value: PortableValue): QualifiedFixture => {
  const fixture = record(value, "fixture");
  exactKeys(
    fixture,
    ["fixtureId", "workspaceKind", "relativePath", "before", "after", "patch"],
    "fixture",
  );
  if (fixture.workspaceKind !== "openhands-local") {
    throw new CodingAgentQualificationError(
      "workspace-boundary-mismatch",
      "Fixture did not use the qualified temporary workspace.",
    );
  }
  const candidate = {
    fixtureId: requiredString(fixture.fixtureId, "fixture.fixtureId"),
    relativePath: requiredString(fixture.relativePath, "fixture.relativePath"),
    before: text(fixture.before, "fixture.before"),
    after: text(fixture.after, "fixture.after"),
    patch: text(fixture.patch, "fixture.patch"),
  };
  validatePath(candidate.relativePath);
  if (
    candidate.fixtureId !== QUALIFIED_FIXTURE.fixtureId ||
    candidate.relativePath !== QUALIFIED_FIXTURE.relativePath ||
    candidate.before !== QUALIFIED_FIXTURE.before ||
    candidate.after !== QUALIFIED_FIXTURE.after ||
    candidate.patch !== QUALIFIED_FIXTURE.patch
  ) {
    throw new CodingAgentQualificationError(
      "repository-change-mismatch",
      "Fixture does not describe the declared repository change.",
    );
  }
  return Object.freeze(candidate);
};

const interpreterEvidence = (
  value: PortableValue,
): CodingAgentExecutableClosureEvidence["interpreter"] => {
  const interpreter = record(value, "executableClosure.interpreter");
  exactKeys(interpreter, ["implementation", "version"], "executableClosure.interpreter");
  if (interpreter.implementation !== "CPython" || interpreter.version !== "3.12.12") {
    throw new CodingAgentQualificationError(
      "interpreter-identity-mismatch",
      "Qualification interpreter does not match the pinned executable subject.",
    );
  }
  return Object.freeze({ implementation: "CPython", version: "3.12.12" });
};

const platformEvidence = (
  value: PortableValue,
): CodingAgentExecutableClosureEvidence["platform"] => {
  const platform = record(value, "executableClosure.platform");
  exactKeys(platform, ["system", "architecture"], "executableClosure.platform");
  if (platform.system !== "Darwin" || platform.architecture !== "arm64") {
    throw new CodingAgentQualificationError(
      "platform-identity-mismatch",
      "Qualification platform does not match the pinned executable subject.",
    );
  }
  return Object.freeze({ system: "Darwin", architecture: "arm64" });
};

const validateExecutableClosure = (value: PortableValue): CodingAgentExecutableClosureEvidence => {
  const closure = record(value, "executableClosure");
  exactKeys(
    closure,
    [
      "lockDigest",
      "probeDigest",
      "installedClosureDigest",
      "installedPackageCount",
      "interpreter",
      "platform",
    ],
    "executableClosure",
  );
  if (
    closure.lockDigest !== OPENHANDS_LOCK_DIGEST ||
    closure.probeDigest !== OPENHANDS_PROBE_DIGEST ||
    closure.installedClosureDigest !== OPENHANDS_INSTALLED_CLOSURE_DIGEST ||
    closure.installedPackageCount !== OPENHANDS_INSTALLED_PACKAGE_COUNT
  ) {
    throw new CodingAgentQualificationError(
      "executable-closure-mismatch",
      "Qualification evidence is not bound to the pinned executable closure.",
    );
  }
  return Object.freeze({
    lockDigest: OPENHANDS_LOCK_DIGEST,
    probeDigest: OPENHANDS_PROBE_DIGEST,
    installedClosureDigest: OPENHANDS_INSTALLED_CLOSURE_DIGEST,
    installedPackageCount: OPENHANDS_INSTALLED_PACKAGE_COUNT,
    interpreter: interpreterEvidence(closure.interpreter!),
    platform: platformEvidence(closure.platform!),
  });
};

const validateSandbox = (value: PortableValue): CodingAgentSandboxEvidence => {
  const sandbox = record(value, "sandbox");
  exactKeys(
    sandbox,
    [
      "executor",
      "ambientEnvironmentInherited",
      "credentialEnvironmentAbsent",
      "deniedFileReadObserved",
      "deniedFileWriteObserved",
      "deniedNetworkObserved",
    ],
    "sandbox",
  );
  if (
    sandbox.executor !== "macos-sandbox-exec" ||
    sandbox.ambientEnvironmentInherited !== false ||
    sandbox.credentialEnvironmentAbsent !== true ||
    sandbox.deniedFileReadObserved !== true ||
    sandbox.deniedFileWriteObserved !== true ||
    sandbox.deniedNetworkObserved !== true
  ) {
    throw new CodingAgentQualificationError(
      "sandbox-evidence-mismatch",
      "Qualification did not prove the declared least-authority sandbox.",
    );
  }
  return Object.freeze({
    executor: "macos-sandbox-exec",
    ambientEnvironmentInherited: false,
    credentialEnvironmentAbsent: true,
    deniedFileReadObserved: true,
    deniedFileWriteObserved: true,
    deniedNetworkObserved: true,
  });
};

const projectArtifacts = (fixture: QualifiedFixture): readonly CodingAgentArtifactEvidence[] =>
  Object.freeze([
    artifact({
      kind: "repository-file-before",
      logicalPath: fixture.relativePath,
      mediaType: "text/plain",
      content: fixture.before,
    }),
    artifact({
      kind: "repository-file-after",
      logicalPath: fixture.relativePath,
      mediaType: "text/plain",
      content: fixture.after,
    }),
    artifact({
      kind: "repository-patch",
      logicalPath: fixture.relativePath,
      mediaType: "text/x-diff",
      content: fixture.patch,
    }),
  ]);

export const projectOpenHandsRepositoryChangeEvidence = (
  input: unknown,
): CodingAgentQualificationEvidence => {
  const observation = record(snapshotPortable(input), "observation");
  exactKeys(
    observation,
    [
      "schemaVersion",
      "upstream",
      "fixture",
      "permissions",
      "nativeEvents",
      "executableClosure",
      "sandbox",
    ],
    "observation",
  );
  if (observation.schemaVersion !== "1.0.0") {
    throw new CodingAgentQualificationError(
      "unsupported-observation-schema",
      "Observation schema is not supported.",
    );
  }
  validateUpstream(observation.upstream!);
  validatePermissions(observation.permissions!);
  const fixture = validateFixture(observation.fixture!);
  return Object.freeze({
    schemaVersion: "1.0.0",
    integration: Object.freeze({
      name: OPENHANDS_QUALIFICATION_PROFILE.integration,
      version: OPENHANDS_QUALIFICATION_PROFILE.version,
      revision: OPENHANDS_QUALIFICATION_PROFILE.revision,
    }),
    fixtureId: fixture.fixtureId,
    workspaceKind: "openhands-local",
    permissions: OPENHANDS_QUALIFICATION_PROFILE.permissions,
    ownership: OPENHANDS_QUALIFICATION_PROFILE.ownership,
    artifacts: projectArtifacts(fixture),
    nativeEvents: projectPinnedMessageEvents(observation.nativeEvents!),
    executableClosure: validateExecutableClosure(observation.executableClosure!),
    sandbox: validateSandbox(observation.sandbox!),
    rawNativePayloadIncluded: false,
  });
};
