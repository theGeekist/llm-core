import { contractVersion, digest, extensionNamespace } from "#contracts";
import {
  createSpecificationAdapterSupport,
  createSpecificationOperation,
  type SpecificationAdapterSupport,
  type SpecificationFormat,
} from "@geekist/llm-core/specifications";

/** The examined Spec Kit CLI/source snapshot. New versions need qualification. */
export const SPEC_KIT_ASSESSED_VERSION = contractVersion("0.14.3-dev.0");
export const SPEC_KIT_ASSESSED_COMMIT = "c0fe0e43cd728ebc3dd1f714343f3921510a157f" as const;

export const SPEC_KIT_FILE_FORMAT: SpecificationFormat = Object.freeze({
  id: extensionNamespace("io.github.spec-kit.file"),
  version: SPEC_KIT_ASSESSED_VERSION,
});

export const SPEC_KIT_CLI_FORMAT: SpecificationFormat = Object.freeze({
  id: extensionNamespace("io.github.spec-kit.cli"),
  version: SPEC_KIT_ASSESSED_VERSION,
});

export const CORE_WORKFLOW_FIXTURE_DIGEST = digest(
  "a3b7c17724df02c7f2ad4cfc58435dd428f11eaa13bd07fa5e46f7726142b2b7",
);
export const CONTROL_WORKFLOW_FIXTURE_DIGEST = digest(
  "a2631cc76387ca38e34bf81c15642ba01d1c96c06117abc8ae29539ef2c79aed",
);
export const WORKFLOW_OVERLAY_FIXTURE_DIGEST = digest(
  "a2dfdf7d2d537839fb372080b3b686f48600f7d41e2fc62cbf5c75e6fff31fbb",
);
const RUN_FAILED_FIXTURE_DIGEST = digest(
  "f46099d9b5ea9084e61960e8573611bb6cda96e95d57b206511ae71ac8826c4c",
);
const RESUME_PAUSED_FIXTURE_DIGEST = digest(
  "7518e3629f4c6fc50d96bab10d8f133fa11eb0f8a5693245f1c020bd1990dad4",
);
const STATUS_RUN_FIXTURE_DIGEST = digest(
  "47769f97ff86560daff2c36ea0d66ea76e4420638ff1ccb6555675d675defaec",
);
const STATUS_LIST_FIXTURE_DIGEST = digest(
  "a29906b64f65c0f16edad07a2175b9dd855ebbadea498f5ac05c87fcee80331a",
);
export const SPEC_KIT_FILE_SUPPORT: SpecificationAdapterSupport = createSpecificationAdapterSupport(
  {
    format: SPEC_KIT_FILE_FORMAT,
    authority: "Spec Kit repository",
    revision: SPEC_KIT_ASSESSED_COMMIT,
    sourceOwnership: "source-owned",
    operations: [
      createSpecificationOperation({
        operation: "observe-native-source",
        sourceContract: {
          authority: "Spec Kit repository",
          format: SPEC_KIT_FILE_FORMAT,
          revision: SPEC_KIT_ASSESSED_COMMIT,
        },
        disposition: "supported",
        fixtures: [
          { fixtureId: "spec-kit.workflow.core.c0fe0e4", digest: CORE_WORKFLOW_FIXTURE_DIGEST },
          {
            fixtureId: "spec-kit.workflow.overlay.installed.c0fe0e4",
            digest: WORKFLOW_OVERLAY_FIXTURE_DIGEST,
          },
        ],
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "derive-portable-specification",
        sourceContract: {
          authority: "Spec Kit repository",
          format: SPEC_KIT_FILE_FORMAT,
          revision: SPEC_KIT_ASSESSED_COMMIT,
        },
        disposition: "supported",
        fixtures: [
          { fixtureId: "spec-kit.workflow.core.c0fe0e4", digest: CORE_WORKFLOW_FIXTURE_DIGEST },
          {
            fixtureId: "spec-kit.workflow.control-flow.c0fe0e4",
            digest: CONTROL_WORKFLOW_FIXTURE_DIGEST,
          },
          {
            fixtureId: "spec-kit.workflow.overlay.installed.c0fe0e4",
            digest: WORKFLOW_OVERLAY_FIXTURE_DIGEST,
          },
        ],
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "compile-portable-specification",
        sourceContract: {
          authority: "Spec Kit repository",
          format: SPEC_KIT_FILE_FORMAT,
          revision: SPEC_KIT_ASSESSED_COMMIT,
        },
        disposition: "unsupported",
        reason: "Spec Kit portable compilation is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "export-native-source",
        sourceContract: {
          authority: "Spec Kit repository",
          format: SPEC_KIT_FILE_FORMAT,
          revision: SPEC_KIT_ASSESSED_COMMIT,
        },
        disposition: "unsupported",
        reason: "Spec Kit native export is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "round-trip-native-source",
        sourceContract: {
          authority: "Spec Kit repository",
          format: SPEC_KIT_FILE_FORMAT,
          revision: SPEC_KIT_ASSESSED_COMMIT,
        },
        disposition: "unsupported",
        reason: "Spec Kit native round trip is not implemented.",
        diagnostics: [],
      }),
    ],
  },
);

export const SPEC_KIT_CLI_SUPPORT: SpecificationAdapterSupport = createSpecificationAdapterSupport({
  format: SPEC_KIT_CLI_FORMAT,
  authority: "Spec Kit repository CLI",
  revision: SPEC_KIT_ASSESSED_COMMIT,
  sourceOwnership: "source-owned",
  operations: [
    createSpecificationOperation({
      operation: "observe-native-source",
      sourceContract: {
        authority: "Spec Kit repository CLI",
        format: SPEC_KIT_CLI_FORMAT,
        revision: SPEC_KIT_ASSESSED_COMMIT,
      },
      disposition: "supported",
      fixtures: [
        { fixtureId: "spec-kit.cli.run-failed.c0fe0e4", digest: RUN_FAILED_FIXTURE_DIGEST },
        { fixtureId: "spec-kit.cli.resume-paused.c0fe0e4", digest: RESUME_PAUSED_FIXTURE_DIGEST },
        { fixtureId: "spec-kit.cli.status-run.c0fe0e4", digest: STATUS_RUN_FIXTURE_DIGEST },
        { fixtureId: "spec-kit.cli.status-list.c0fe0e4", digest: STATUS_LIST_FIXTURE_DIGEST },
      ],
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "derive-portable-specification",
      sourceContract: {
        authority: "Spec Kit repository CLI",
        format: SPEC_KIT_CLI_FORMAT,
        revision: SPEC_KIT_ASSESSED_COMMIT,
      },
      disposition: "unsupported",
      reason: "Spec Kit CLI portable derivation is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "compile-portable-specification",
      sourceContract: {
        authority: "Spec Kit repository CLI",
        format: SPEC_KIT_CLI_FORMAT,
        revision: SPEC_KIT_ASSESSED_COMMIT,
      },
      disposition: "unsupported",
      reason: "Spec Kit CLI portable compilation is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "export-native-source",
      sourceContract: {
        authority: "Spec Kit repository CLI",
        format: SPEC_KIT_CLI_FORMAT,
        revision: SPEC_KIT_ASSESSED_COMMIT,
      },
      disposition: "unsupported",
      reason: "Spec Kit CLI native export is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "round-trip-native-source",
      sourceContract: {
        authority: "Spec Kit repository CLI",
        format: SPEC_KIT_CLI_FORMAT,
        revision: SPEC_KIT_ASSESSED_COMMIT,
      },
      disposition: "unsupported",
      reason: "Spec Kit CLI native round trip is not implemented.",
      diagnostics: [],
    }),
  ],
});
