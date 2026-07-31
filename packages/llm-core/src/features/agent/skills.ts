import { isDigest, isExternalId, type Digest, type InvocationContext } from "#contracts";
import { maybeMap, type MaybePromise } from "#shared/maybe";

declare const skillIdBrand: unique symbol;
export type SkillId = string & { readonly [skillIdBrand]: "SkillId" };
export type SkillScope = "admin" | "repo" | "system" | "user";

export interface AgentSkillRef {
  readonly skillId: SkillId;
  readonly scope: SkillScope;
  readonly digest: Digest;
}

export interface LocalSkillCandidate extends AgentSkillRef {
  /** Live host input. This path must never enter AgentDefinition or a snapshot. */
  readonly localPath: string;
}

export interface LocalSkillLoadRequest {
  readonly directories: readonly string[];
  readonly disabledSkillIds?: readonly SkillId[];
}

export interface LocalSkillLoader {
  load(input: LocalSkillLoadInput): MaybePromise<readonly LocalSkillCandidate[]>;
}

export interface LocalSkillLoadInput {
  readonly request: LocalSkillLoadRequest;
  readonly context: InvocationContext;
}

const SCOPES = new Set<SkillScope>(["admin", "repo", "system", "user"]);

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};

export const registerAgentSkill = (value: unknown): AgentSkillRef => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "digest,scope,skillId"
  ) {
    throw new TypeError("Agent skills must use a closed portable identity.");
  }
  const candidate = value as Partial<AgentSkillRef>;
  if (
    !isExternalId(candidate.skillId) ||
    !SCOPES.has(candidate.scope as SkillScope) ||
    !isDigest(candidate.digest)
  ) {
    throw new TypeError("Agent skills require an opaque ID, scope and SHA-256 digest.");
  }
  return deepFreeze(structuredClone(candidate)) as AgentSkillRef;
};

const stripLocalPaths = (
  candidates: readonly LocalSkillCandidate[],
  disabledSkillIds: ReadonlySet<string>,
): readonly AgentSkillRef[] => {
  const registered = candidates
    .map((candidate) => {
      if (
        typeof candidate !== "object" ||
        candidate === null ||
        Object.keys(candidate).sort().join(",") !== "digest,localPath,scope,skillId" ||
        typeof candidate.localPath !== "string" ||
        candidate.localPath.trim().length === 0
      ) {
        throw new TypeError("Local skills require a closed candidate and nonblank path.");
      }
      return registerAgentSkill({
        skillId: candidate.skillId,
        scope: candidate.scope,
        digest: candidate.digest,
      });
    })
    .filter((skill) => !disabledSkillIds.has(skill.skillId));
  const identities = new Set<string>();
  for (const skill of registered) {
    const identity = `${skill.scope}:${skill.skillId}`;
    if (identities.has(identity)) {
      throw new TypeError("Local skill loading cannot return duplicate portable identities.");
    }
    identities.add(identity);
  }
  return Object.freeze(registered);
};

export interface LoadAgentSkillsInput extends LocalSkillLoadInput {
  readonly loader: LocalSkillLoader;
}

export const loadAgentSkills = ({
  request,
  context,
  loader,
}: LoadAgentSkillsInput): MaybePromise<readonly AgentSkillRef[]> => {
  if (
    typeof request !== "object" ||
    request === null ||
    Object.keys(request).every((key) => ["directories", "disabledSkillIds"].includes(key)) ===
      false ||
    !Array.isArray(request.directories) ||
    request.directories.length === 0 ||
    !request.directories.every(
      (directory) => typeof directory === "string" && directory.trim().length > 0,
    ) ||
    (request.disabledSkillIds !== undefined &&
      (!Array.isArray(request.disabledSkillIds) ||
        !request.disabledSkillIds.every(isExternalId) ||
        new Set(request.disabledSkillIds).size !== request.disabledSkillIds.length))
  ) {
    throw new TypeError("Local skill loading requires explicit host directories.");
  }
  const disabledSkillIds = new Set<string>(request.disabledSkillIds ?? []);
  return maybeMap(
    (candidates) => stripLocalPaths(candidates, disabledSkillIds),
    loader.load({
      request: structuredClone(request),
      context: structuredClone(context),
    }),
  );
};
