import { snapshot } from "@aifsd/strict-json";
import type { AcquiredIntegration, ActivationGrant, SecretRef } from "./contract.js";
import { integrationClosureDigest } from "./content-identity.js";

export interface ActivationGrantInput {
  readonly grantId: string;
  readonly workerId: string;
  readonly acquisition: AcquiredIntegration;
  readonly operation: string;
  readonly workspace: string;
  readonly filesystem: readonly string[];
  readonly process: readonly string[];
  readonly network: readonly string[];
  readonly effects: readonly string[];
  readonly credentialBindings: Readonly<Record<string, SecretRef>>;
  readonly expiresAt: string;
}

export const createActivationGrant = (input: ActivationGrantInput): ActivationGrant =>
  snapshot({
    grantId: input.grantId,
    workerId: input.workerId,
    integrationName: input.acquisition.manifest.identity.name,
    integrationVersion: input.acquisition.manifest.identity.version,
    rootArtifactDigest: input.acquisition.rootArtifact.digest,
    subjectClosureDigest: integrationClosureDigest(input.acquisition.executableClosure),
    operation: input.operation,
    workspace: input.workspace,
    filesystem: input.filesystem,
    process: input.process,
    network: input.network,
    effects: input.effects,
    credentialBindings: input.credentialBindings,
    expiresAt: input.expiresAt,
  }) as unknown as ActivationGrant;
