import { cloneFrozen } from "#shared/portable-data";
import { contractVersion, digest, extensionNamespace } from "#contracts";
import {
  createSpecificationAdapterSupport,
  createSpecificationOperation,
  type SpecificationAdapterSupport,
  type SpecificationFormat,
} from "@geekist/llm-core/specifications";

/** The contract SemVer remains distinct from the native CLI spelling in cli.ts. */
const assessedVersion = contractVersion("0.14.3-dev.0");
const assessedCommit = "c0fe0e43cd728ebc3dd1f714343f3921510a157f";
const fileFormat = { id: extensionNamespace("io.github.spec-kit.file"), version: assessedVersion };
const cliFormat = { id: extensionNamespace("io.github.spec-kit.cli"), version: assessedVersion };

/** Exact authority, provenance and independently hashed evidence for file and CLI claims. */
export const specKitContract = cloneFrozen({
  version: assessedVersion,
  commit: assessedCommit,
  namespace: extensionNamespace("io.github.spec-kit"),
  file: { authority: "Spec Kit repository", format: fileFormat, revision: assessedCommit },
  cli: { authority: "Spec Kit repository CLI", format: cliFormat, revision: assessedCommit },
  fixtures: {
    coreWorkflow: {
      fixtureId: "spec-kit.workflow.core.c0fe0e4",
      digest: digest("a3b7c17724df02c7f2ad4cfc58435dd428f11eaa13bd07fa5e46f7726142b2b7"),
    },
    controlWorkflow: {
      fixtureId: "spec-kit.workflow.control-flow.c0fe0e4",
      digest: digest("a2631cc76387ca38e34bf81c15642ba01d1c96c06117abc8ae29539ef2c79aed"),
    },
    workflowOverlay: {
      fixtureId: "spec-kit.workflow.overlay.installed.c0fe0e4",
      digest: digest("a2dfdf7d2d537839fb372080b3b686f48600f7d41e2fc62cbf5c75e6fff31fbb"),
    },
    runFailed: {
      fixtureId: "spec-kit.cli.run-failed.c0fe0e4",
      digest: digest("f46099d9b5ea9084e61960e8573611bb6cda96e95d57b206511ae71ac8826c4c"),
    },
    resumePaused: {
      fixtureId: "spec-kit.cli.resume-paused.c0fe0e4",
      digest: digest("7518e3629f4c6fc50d96bab10d8f133fa11eb0f8a5693245f1c020bd1990dad4"),
    },
    statusRun: {
      fixtureId: "spec-kit.cli.status-run.c0fe0e4",
      digest: digest("47769f97ff86560daff2c36ea0d66ea76e4420638ff1ccb6555675d675defaec"),
    },
    statusList: {
      fixtureId: "spec-kit.cli.status-list.c0fe0e4",
      digest: digest("a29906b64f65c0f16edad07a2175b9dd855ebbadea498f5ac05c87fcee80331a"),
    },
  },
  observationDiagnostics: {
    workflowState: {
      code: "spec-kit-workflow-state-not-durable-checkpoint",
      severity: "warning",
      impact: "advisory",
      explanation:
        "Local Spec Kit workflow state remains source-owned observation data; it is not an llm-core durable execution checkpoint.",
    },
    unclassifiedFile: {
      code: "spec-kit-unclassified-file-preserved",
      severity: "info",
      impact: "advisory",
      explanation: "The unclassified Spec Kit file remains a source-owned artifact.",
    },
  },
} as const);
export const SPEC_KIT_ASSESSED_VERSION = specKitContract.version;
export const SPEC_KIT_ASSESSED_COMMIT = specKitContract.commit;
export const SPEC_KIT_FILE_FORMAT: SpecificationFormat = specKitContract.file.format;
export const SPEC_KIT_CLI_FORMAT: SpecificationFormat = specKitContract.cli.format;
export const CORE_WORKFLOW_FIXTURE_DIGEST = specKitContract.fixtures.coreWorkflow.digest;
export const CONTROL_WORKFLOW_FIXTURE_DIGEST = specKitContract.fixtures.controlWorkflow.digest;
export const WORKFLOW_OVERLAY_FIXTURE_DIGEST = specKitContract.fixtures.workflowOverlay.digest;
export const SPEC_KIT_FILE_SUPPORT: SpecificationAdapterSupport = createSpecificationAdapterSupport(
  {
    ...specKitContract.file,
    sourceOwnership: "source-owned",
    operations: [
      createSpecificationOperation({
        operation: "observe-native-source",
        sourceContract: specKitContract.file,
        disposition: "supported",
        fixtures: [specKitContract.fixtures.coreWorkflow, specKitContract.fixtures.workflowOverlay],
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "derive-portable-specification",
        sourceContract: specKitContract.file,
        disposition: "supported",
        fixtures: [
          specKitContract.fixtures.coreWorkflow,
          specKitContract.fixtures.controlWorkflow,
          specKitContract.fixtures.workflowOverlay,
        ],
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "compile-portable-specification",
        sourceContract: specKitContract.file,
        disposition: "unsupported",
        reason: "Spec Kit portable compilation is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "export-native-source",
        sourceContract: specKitContract.file,
        disposition: "unsupported",
        reason: "Spec Kit native export is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "round-trip-native-source",
        sourceContract: specKitContract.file,
        disposition: "unsupported",
        reason: "Spec Kit native round trip is not implemented.",
        diagnostics: [],
      }),
    ],
  },
);

export const SPEC_KIT_CLI_SUPPORT: SpecificationAdapterSupport = createSpecificationAdapterSupport({
  ...specKitContract.cli,
  sourceOwnership: "source-owned",
  operations: [
    createSpecificationOperation({
      operation: "observe-native-source",
      sourceContract: specKitContract.cli,
      disposition: "supported",
      fixtures: [
        specKitContract.fixtures.runFailed,
        specKitContract.fixtures.resumePaused,
        specKitContract.fixtures.statusRun,
        specKitContract.fixtures.statusList,
      ],
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "derive-portable-specification",
      sourceContract: specKitContract.cli,
      disposition: "unsupported",
      reason: "Spec Kit CLI portable derivation is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "compile-portable-specification",
      sourceContract: specKitContract.cli,
      disposition: "unsupported",
      reason: "Spec Kit CLI portable compilation is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "export-native-source",
      sourceContract: specKitContract.cli,
      disposition: "unsupported",
      reason: "Spec Kit CLI native export is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "round-trip-native-source",
      sourceContract: specKitContract.cli,
      disposition: "unsupported",
      reason: "Spec Kit CLI native round trip is not implemented.",
      diagnostics: [],
    }),
  ],
});
