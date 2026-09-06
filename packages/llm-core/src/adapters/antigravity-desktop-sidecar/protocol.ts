import type { MaybePromise } from "#shared/maybe";

export type AntigravitySidecarRestartPolicy = "never" | "on-failure" | "always";

export interface AntigravityDesktopAppIdentity {
  readonly product: "Antigravity Desktop";
  readonly version: string;
  readonly bundleId?: string;
}

export interface AntigravitySidecarProcessIdentity {
  readonly id: string;
  readonly manifestSha256?: string;
  readonly supervised: boolean;
  readonly restartPolicy: AntigravitySidecarRestartPolicy;
}

export interface AntigravityAgentApiIdentity {
  readonly executable: "agentapi";
  readonly providerInjected: true;
  readonly path?: string;
}

export interface AntigravitySidecarRuntimeIdentities {
  readonly desktopApp: AntigravityDesktopAppIdentity;
  readonly sidecar: AntigravitySidecarProcessIdentity;
  readonly agentapi: AntigravityAgentApiIdentity;
}

export interface AntigravitySidecarSourceContract {
  readonly desktopHostVersion: string;
  readonly sidecarContractVersion: string;
  readonly identities: AntigravitySidecarRuntimeIdentities;
}

export interface AgentApiNewConversationRequest {
  readonly prompt: string;
  readonly projectId?: string;
  readonly cwd?: string;
}

export interface AgentApiNewConversationResponse {
  readonly conversationId: string;
  readonly eventFile?: string;
}

export interface AgentApiSendMessageRequest {
  readonly conversationId: string;
  readonly prompt: string;
}

export interface AgentApiSendMessageResponse {
  readonly accepted: boolean;
  readonly messageId?: string;
  readonly eventFile?: string;
}

export interface AntigravityConversationStateInspection {
  readonly state: "idle" | "busy" | "stale";
  readonly lastEventSha256?: string;
}

export interface AntigravityDesktopSidecarClient {
  readonly sourceContract: AntigravitySidecarSourceContract;
  newConversation(
    request: AgentApiNewConversationRequest,
  ): MaybePromise<AgentApiNewConversationResponse>;
  sendMessage(request: AgentApiSendMessageRequest): MaybePromise<AgentApiSendMessageResponse>;
  inspectConversation(conversationId: string): MaybePromise<AntigravityConversationStateInspection>;
}

export type AntigravitySidecarConfigFailure = "disabledConfiguration" | "missingProjectId";

export class AntigravitySidecarConfigurationError extends Error {
  readonly failure: AntigravitySidecarConfigFailure;

  constructor(failure: AntigravitySidecarConfigFailure, message: string) {
    super(`[${failure}] ${message}`);
    this.name = "AntigravitySidecarConfigurationError";
    this.failure = failure;
  }
}

export type AntigravitySidecarProcessFailure =
  | "absentProcess"
  | "processCrash"
  | "unavailableAgentApi";

export class AntigravitySidecarProcessError extends Error {
  readonly failure: AntigravitySidecarProcessFailure;

  constructor(failure: AntigravitySidecarProcessFailure, message: string) {
    super(`[${failure}] ${message}`);
    this.name = "AntigravitySidecarProcessError";
    this.failure = failure;
  }
}

export class AntigravityStaleConversationError extends Error {
  readonly conversationId: string;

  constructor(
    conversationId: string,
    message = `Conversation '${conversationId}' is stale or unknown.`,
  ) {
    super(message);
    this.name = "AntigravityStaleConversationError";
    this.conversationId = conversationId;
  }
}
