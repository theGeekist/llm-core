import { createHash } from "node:crypto";
import { canonicalize } from "@aifsd/strict-json";
import { contractVersion, digest, secretRef } from "@aifsd/llm-core/contracts";

import {
  createConfigurationLock,
  resolveManifest,
  type ConfigurationLock,
  type ConfigurationResult,
  type Catalog,
  type CatalogAdmission,
  type CatalogEntry,
  type ConfigurationLockInput,
  type GeneratorIdentity,
  type Manifest,
  type MaybePromise,
} from "../../../src/config/index.js";

const sha = (character: string) => digest(character.repeat(64));

export const fixtureContentDigest = (value: unknown) =>
  digest(createHash("sha256").update(canonicalize(value), "utf8").digest("hex"));

export const digests = {
  catalog: sha("a"),
  generator: sha("b"),
  integration: sha("c"),
  integrationDependency: sha("d"),
  materialization: sha("e"),
  nativeFile: sha("f"),
  packageLock: sha("1"),
  template: sha("2"),
  templateDependency: sha("3"),
} as const;

export const createManifest = (): Manifest => {
  const selections: Manifest["selections"] = [
    {
      kind: "template",
      name: "native-node",
      versionRange: "^1.0.0" as Manifest["selections"][number]["versionRange"],
      secrets: {
        applicationKey: secretRef("fixture/application-key"),
        auditKey: secretRef("fixture/audit-key"),
      },
      settings: { output: "generated/aifsd-config.mjs" },
    },
    {
      kind: "integration",
      name: "native-logger",
      versionRange: "1.0.0" as Manifest["selections"][number]["versionRange"],
    },
  ];
  return {
    schemaVersion: contractVersion("1.0.0"),
    intent: {
      summary: "Materialize a native Node application",
      outcomes: ["native-execution", "independent-review"],
    },
    selections,
    environments: {
      local: {
        selections: [
          {
            kind: "template",
            name: "native-node",
            versionRange: "^1.0.0",
            secrets: { applicationKey: secretRef("local/application-key") },
            settings: { mode: "development" },
          },
        ],
      },
    },
  };
};

export const generator: GeneratorIdentity = {
  id: "aifsd.native-esm",
  version: "1.0.0",
  artifactDigest: digests.generator,
};

export const createCatalog = (): Catalog => {
  const snapshot: Omit<Catalog, "snapshotDigest"> = {
    identity: { id: "fixture-catalog", version: "2026.08.06" },
    sequence: 42,
    authority: {
      provenance: "fixture://catalogue/2026-08-06",
      signature: "fixture:catalogue-signature",
    },
    entries: [
      {
        kind: "template",
        name: "native-node",
        version: "1.2.0",
        artifactDigest: digests.template,
        closure: {
          root: { id: "native-node", version: "1.2.0", digest: digests.template },
          representation: {
            kind: "members",
            members: [
              {
                id: "template-renderer",
                version: "2.0.0",
                digest: digests.templateDependency,
              },
            ],
          },
        },
        trust: "official",
        signature: "fixture:template-signature",
        evidence: [],
      },
      {
        kind: "integration",
        name: "native-logger",
        version: "1.0.0",
        artifactDigest: digests.integration,
        closure: {
          root: { id: "native-logger", version: "1.0.0", digest: digests.integration },
          representation: { kind: "package-lock", lockDigest: digests.packageLock },
        },
        trust: "verified",
        signature: "fixture:integration-signature",
        evidence: [],
      },
    ],
  };
  return { ...snapshot, snapshotDigest: fixtureContentDigest(snapshot) };
};

export const withCatalogEntries = (catalog: Catalog, entries: readonly CatalogEntry[]): Catalog => {
  const snapshot = {
    identity: catalog.identity,
    sequence: catalog.sequence,
    authority: catalog.authority,
    entries,
  };
  return { ...snapshot, snapshotDigest: fixtureContentDigest(snapshot) };
};

export const admitCatalog = (
  catalog: Catalog,
  minimumSequence = catalog.sequence,
): CatalogAdmission => ({
  catalog: catalog.identity,
  snapshotDigest: catalog.snapshotDigest,
  minimumSequence,
});

export const createLockInput = (): ConfigurationLockInput => ({
  materializationInputsDigest: digests.materialization,
  target: { os: "darwin", arch: "arm64" },
});

const synchronous = <T>(value: MaybePromise<T>): T => {
  if (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value
  ) {
    throw new Error("Expected synchronous fixture branch");
  }
  return value as T;
};

const unwrap = <T>(result: ConfigurationResult<T>): T => {
  if (!result.ok) {
    throw new Error(`Fixture construction failed: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.value;
};

export const createLockFixture = (): ConfigurationLock =>
  unwrap(
    createConfigurationLock(
      unwrap(
        synchronous(
          resolveManifest(createManifest(), createCatalog(), {
            generator,
            catalogAdmission: admitCatalog(createCatalog()),
          }),
        ),
      ),
      createLockInput(),
    ),
  );
