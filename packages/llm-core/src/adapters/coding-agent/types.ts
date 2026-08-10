export type CodingAgentOperationDisposition = "supported" | "unsupported" | "not-applicable";

export interface CodingAgentContractReference {
  readonly authority: string;
  readonly version: string;
  readonly revision: string;
}

export interface CodingAgentOperationDeclaration {
  readonly operation: string;
  readonly disposition: CodingAgentOperationDisposition;
  readonly owner: "OpenHands Software Agent SDK" | "@geekist/llm-core";
  readonly contract: CodingAgentContractReference;
  readonly fixtures: readonly string[];
}

export interface CodingAgentPermissionBoundary {
  readonly filesystem: readonly ("workspace.read" | "workspace.write")[];
  readonly process: readonly "python"[];
  readonly network: readonly string[];
  readonly effects: readonly "repository.write"[];
}

export interface CodingAgentOwnershipBoundary {
  readonly execution: "integration-owned";
  readonly workspace: "integration-owned";
  readonly trajectory: "integration-owned";
  readonly session: "integration-owned";
  readonly portableProjection: "llm-core-owned";
}

export interface OpenHandsQualificationProfile {
  readonly integration: "OpenHands Software Agent SDK";
  readonly version: "1.37.1";
  readonly revision: "310989d306114efd0fcadbcbed9ff9c21d4a5963";
  readonly packageRequirement: "openhands-sdk==1.37.1";
  readonly permissions: CodingAgentPermissionBoundary;
  readonly ownership: CodingAgentOwnershipBoundary;
  readonly nativeSessionSemantics: "OpenHands ConversationState and event tree";
  readonly cancellation: "native-upstream-unqualified";
  readonly publication: "not-approved";
}

export interface CodingAgentArtifactEvidence {
  readonly kind: "repository-file-before" | "repository-file-after" | "repository-patch";
  readonly logicalPath: string;
  readonly mediaType: "text/plain" | "text/x-diff";
  readonly digest: string;
  readonly byteLength: number;
}

export interface CodingAgentNativeEventEvidence {
  readonly sequence: number;
  readonly nativeType: "MessageEvent";
  readonly source: "user" | "agent";
  readonly role: "user" | "assistant";
  readonly nativeEventId: string;
  readonly occurredAt: string;
  readonly digest: string;
  readonly byteLength: number;
}

export interface CodingAgentExecutableClosureEvidence {
  readonly lockDigest: string;
  readonly probeDigest: string;
  readonly installedClosureDigest: string;
  readonly installedPackageCount: number;
  readonly interpreter: {
    readonly implementation: "CPython";
    readonly version: "3.12.12";
  };
  readonly platform: {
    readonly system: "Darwin";
    readonly architecture: "arm64";
  };
}

export interface CodingAgentSandboxEvidence {
  readonly executor: "macos-sandbox-exec";
  readonly ambientEnvironmentInherited: false;
  readonly credentialEnvironmentAbsent: true;
  readonly deniedFileReadObserved: true;
  readonly deniedFileWriteObserved: true;
  readonly deniedNetworkObserved: true;
}

export interface CodingAgentQualificationEvidence {
  readonly schemaVersion: "1.0.0";
  readonly integration: {
    readonly name: "OpenHands Software Agent SDK";
    readonly version: "1.37.1";
    readonly revision: "310989d306114efd0fcadbcbed9ff9c21d4a5963";
  };
  readonly fixtureId: string;
  readonly workspaceKind: "openhands-local";
  readonly permissions: CodingAgentPermissionBoundary;
  readonly ownership: CodingAgentOwnershipBoundary;
  readonly artifacts: readonly CodingAgentArtifactEvidence[];
  readonly nativeEvents: readonly CodingAgentNativeEventEvidence[];
  readonly executableClosure: CodingAgentExecutableClosureEvidence;
  readonly sandbox: CodingAgentSandboxEvidence;
  readonly rawNativePayloadIncluded: false;
}
