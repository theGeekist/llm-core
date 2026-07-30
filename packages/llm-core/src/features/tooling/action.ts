import { isContractVersion, isDigest, isExternalId } from "#contracts";
import type { SecretRef } from "#contracts";
import { maybeMap, type MaybePromise } from "#shared/maybe";
import { canonicalizeJson, freezeJsonValue, normalizeStrictJson } from "./canonical-json";
import { isRegisteredToolSchema } from "./schema-registration";
import type { ActionDocument, EffectTarget, ToolCall, ToolId, ToolSpec } from "./types";

declare const actionDigestValueBrand: unique symbol;

export type ActionDigestValue = string & {
  readonly [actionDigestValueBrand]: "ActionDigestValue";
};

export interface ActionDigest {
  algorithm: "hmac-sha-256";
  keyRef: SecretRef;
  value: ActionDigestValue;
}

export interface ActionDigestMaterial {
  canonicalDocument: string;
  securityDomain: string;
  keyRef: SecretRef;
}

export interface ActionDigestVerification extends ActionDigestMaterial {
  digest: ActionDigest;
}

export interface ActionDigestPort {
  /**
   * HMAC-SHA-256 over the canonical document's UTF-8 bytes, using the opaque
   * key reference within the supplied security-domain isolation boundary.
   */
  create(material: ActionDigestMaterial): MaybePromise<ActionDigest>;
  verify(verification: ActionDigestVerification): MaybePromise<boolean>;
}

export interface BoundAction {
  document: ActionDocument;
  canonicalDocument: string;
  digest: ActionDigest;
}

export interface BindActionInput {
  spec: ToolSpec;
  call: ToolCall;
  securityDomain: string;
  keyRef: SecretRef;
  digestPort: ActionDigestPort;
}

const TOOL_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const SAFE_IDENTIFIER_PATTERN = /^[!-~]{1,255}$/;
const ACTION_DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function toolId(value: string): ToolId {
  if (!TOOL_ID_PATTERN.test(value)) {
    throw new TypeError("Tool IDs must be stable lowercase namespaced identifiers.");
  }
  return value as ToolId;
}

export function actionDigest(value: string, keyRef: SecretRef): ActionDigest {
  if (!ACTION_DIGEST_PATTERN.test(value) || !isExternalId(keyRef.secretId)) {
    throw new TypeError(
      "Action digests require unpadded base64url HMAC-SHA-256 and a key reference.",
    );
  }
  return Object.freeze({
    algorithm: "hmac-sha-256",
    keyRef: Object.freeze({ secretId: keyRef.secretId }),
    value: value as ActionDigestValue,
  });
}

const compareTargets = (left: EffectTarget, right: EffectTarget): number =>
  left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id);

const normalizeTargets = (targets: EffectTarget[]): EffectTarget[] =>
  targets
    .map((target) => {
      if (!SAFE_IDENTIFIER_PATTERN.test(target.id)) {
        throw new TypeError("Effect target IDs must be printable non-whitespace identifiers.");
      }
      return { kind: target.kind, id: target.id };
    })
    .sort(compareTargets);

const assertToolSpec = (spec: ToolSpec): void => {
  if (!TOOL_ID_PATTERN.test(spec.id) || !isContractVersion(spec.version)) {
    throw new TypeError("Tool specs require a stable ID and immutable SemVer version.");
  }
  if (!isRegisteredToolSchema(spec.inputSchema) || !isDigest(spec.inputSchema.digest)) {
    throw new TypeError("Tool specs require a registered input-schema digest.");
  }
  if (spec.effect.class !== "read-only" && spec.effect.targets.length === 0) {
    throw new TypeError("Meaningful effects require at least one explicit effect target.");
  }
};

export const defineToolSpec = (spec: ToolSpec): ToolSpec => {
  assertToolSpec(spec);
  const defined = {
    ...spec,
    inputSchema: spec.inputSchema,
    effect: {
      class: spec.effect.class,
      targets: normalizeTargets(spec.effect.targets),
    },
    execution: { ...spec.execution },
  };
  defined.effect.targets.forEach(Object.freeze);
  Object.freeze(defined.effect.targets);
  Object.freeze(defined.effect);
  Object.freeze(defined.execution);
  return Object.freeze(defined);
};

const assertCallMatchesSpec = (spec: ToolSpec, call: ToolCall): void => {
  if (call.toolId !== spec.id || call.toolVersion !== spec.version) {
    throw new TypeError("Tool call identity and version must match the bound tool spec.");
  }
};

const readAuthority = (call: ToolCall): ActionDocument["authority"] => {
  const authority: ActionDocument["authority"] = {};
  if (call.invocation.tenant) {
    authority.tenantId = call.invocation.tenant.tenantId;
  }
  if (call.invocation.principal) {
    authority.principalId = call.invocation.principal.principalId;
  }
  if (call.invocation.delegationChain) {
    authority.delegationChain = call.invocation.delegationChain.map(
      (principal) => principal.principalId,
    );
  }
  return authority;
};

export const createActionDocument = (spec: ToolSpec, call: ToolCall): ActionDocument => {
  assertToolSpec(spec);
  assertCallMatchesSpec(spec, call);
  const document: ActionDocument = {
    contractProfile: "llm-core.action/v1",
    tool: {
      id: spec.id,
      version: spec.version,
      inputSchemaDigest: spec.inputSchema.digest,
    },
    effect: {
      class: spec.effect.class,
      targets: normalizeTargets(spec.effect.targets),
    },
    authority: readAuthority(call),
    execution: { ...spec.execution },
    arguments: normalizeStrictJson(call.arguments),
  };
  return freezeJsonValue(normalizeStrictJson(document)) as unknown as ActionDocument;
};

const isActionDigest = (value: unknown, keyRef: SecretRef): value is ActionDigest => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ActionDigest>;
  return (
    candidate.algorithm === "hmac-sha-256" &&
    candidate.keyRef?.secretId === keyRef.secretId &&
    typeof candidate.value === "string" &&
    ACTION_DIGEST_PATTERN.test(candidate.value)
  );
};

const assertDigestMaterial = (securityDomain: string, keyRef: SecretRef): void => {
  if (!SAFE_IDENTIFIER_PATTERN.test(securityDomain) || !isExternalId(keyRef.secretId)) {
    throw new TypeError("Action digests require an opaque security domain and key reference.");
  }
};

const toBoundAction =
  (document: ActionDocument, canonicalDocument: string, keyRef: SecretRef) =>
  (digest: ActionDigest): BoundAction => {
    if (!isActionDigest(digest, keyRef)) {
      throw new TypeError("Action digest ports must return a matching HMAC-SHA-256 digest.");
    }
    return Object.freeze({
      document,
      canonicalDocument,
      digest: actionDigest(digest.value, keyRef),
    });
  };

export const bindAction = (input: BindActionInput): MaybePromise<BoundAction> => {
  assertDigestMaterial(input.securityDomain, input.keyRef);
  const document = createActionDocument(input.spec, input.call);
  const canonicalDocument = canonicalizeJson(document);
  return maybeMap(
    toBoundAction(document, canonicalDocument, input.keyRef),
    input.digestPort.create({
      canonicalDocument,
      securityDomain: input.securityDomain,
      keyRef: input.keyRef,
    }),
  );
};

export const verifyActionDigest = (
  input: Omit<BindActionInput, "digestPort"> & {
    digest: ActionDigest;
    digestPort: ActionDigestPort;
  },
): MaybePromise<boolean> => {
  assertDigestMaterial(input.securityDomain, input.keyRef);
  if (!isActionDigest(input.digest, input.keyRef)) {
    return false;
  }
  const canonicalDocument = canonicalizeJson(createActionDocument(input.spec, input.call));
  return input.digestPort.verify({
    canonicalDocument,
    securityDomain: input.securityDomain,
    keyRef: input.keyRef,
    digest: input.digest,
  });
};

export const actionDigestInput = (document: ActionDocument): string => canonicalizeJson(document);
