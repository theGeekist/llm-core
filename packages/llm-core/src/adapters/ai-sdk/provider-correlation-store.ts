import { isUuidV7 } from "#contracts";
import type {
  AiSdk7ToolCallCorrelation,
  AiSdk7ToolCallCorrelationScope,
  AiSdk7ToolCallCorrelationStore,
} from "./provider-types";

type ScopeState = {
  providerToCorrelation: Map<string, AiSdk7ToolCallCorrelation>;
  coreToCorrelation: Map<AiSdk7ToolCallCorrelation["coreToolCallId"], AiSdk7ToolCallCorrelation>;
};

const scopeKey = (scope: AiSdk7ToolCallCorrelationScope): string =>
  scope.kind === "conversation"
    ? `conversation:${scope.conversationId}`
    : `invocation:${scope.invocationId}`;

/**
 * Process-local correlation storage with explicit LRU retention.
 *
 * This implementation is suitable only when restart durability is unnecessary.
 * Supply a durable implementation of `AiSdk7ToolCallCorrelationStore` when
 * persisted conversation history must survive process reconstruction.
 */
export const createInMemoryAiSdk7ToolCallCorrelationStore = (input: {
  maxScopes: number;
}): AiSdk7ToolCallCorrelationStore => {
  if (!Number.isSafeInteger(input.maxScopes) || input.maxScopes < 1) {
    throw new TypeError("AI SDK correlation storage requires a positive maxScopes limit.");
  }
  const maxScopes = input.maxScopes;

  const scopes = new Map<string, ScopeState>();
  const coreOwners = new Map<AiSdk7ToolCallCorrelation["coreToolCallId"], string>();

  const removeScope = (key: string): void => {
    const state = scopes.get(key);
    if (!state) {
      return;
    }
    for (const coreToolCallId of state.coreToCorrelation.keys()) {
      if (coreOwners.get(coreToolCallId) === key) {
        coreOwners.delete(coreToolCallId);
      }
    }
    scopes.delete(key);
  };

  const touch = (key: string, state: ScopeState): void => {
    scopes.delete(key);
    scopes.set(key, state);
  };

  return {
    load: ({ scope }) => {
      const key = scopeKey(scope);
      const state = scopes.get(key);
      if (!state) {
        return [];
      }
      touch(key, state);
      return [...state.providerToCorrelation.values()];
    },
    record: ({ scope, correlations }) => {
      const key = scopeKey(scope);
      const existing = scopes.get(key);
      const snapshots = correlations.map((correlation) => {
        if (
          typeof correlation.providerToolCallId !== "string" ||
          correlation.providerToolCallId.length === 0 ||
          typeof correlation.toolName !== "string" ||
          correlation.toolName.length === 0 ||
          !isUuidV7(correlation.coreToolCallId)
        ) {
          throw new TypeError("AI SDK tool-call correlation is invalid.");
        }
        return Object.freeze({ ...correlation });
      });
      const state: ScopeState = {
        providerToCorrelation: new Map(existing?.providerToCorrelation),
        coreToCorrelation: new Map(existing?.coreToCorrelation),
      };
      for (const correlation of snapshots) {
        const providerCollision = state.providerToCorrelation.get(correlation.providerToolCallId);
        const coreCollision = state.coreToCorrelation.get(correlation.coreToolCallId);
        const ownerCollision = coreOwners.get(correlation.coreToolCallId);
        if (
          (providerCollision &&
            (providerCollision.coreToolCallId !== correlation.coreToolCallId ||
              providerCollision.toolName !== correlation.toolName)) ||
          (coreCollision &&
            (coreCollision.providerToolCallId !== correlation.providerToolCallId ||
              coreCollision.toolName !== correlation.toolName)) ||
          (ownerCollision !== undefined && ownerCollision !== key)
        ) {
          throw new TypeError("AI SDK tool-call correlation collision.");
        }
        state.providerToCorrelation.set(correlation.providerToolCallId, correlation);
        state.coreToCorrelation.set(correlation.coreToolCallId, correlation);
      }
      touch(key, state);
      for (const correlation of snapshots) {
        coreOwners.set(correlation.coreToolCallId, key);
      }
      while (scopes.size > maxScopes) {
        const oldestKey = scopes.keys().next().value;
        if (typeof oldestKey === "string") {
          removeScope(oldestKey);
        }
      }
    },
    delete: ({ scope }) => {
      removeScope(scopeKey(scope));
    },
  };
};
