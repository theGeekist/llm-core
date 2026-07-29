import type { OpaqueId } from "#contracts";

/**
 * Model-feature reference identities (ADR-004).
 *
 * These express selection and configuration intent only. None of them carries a
 * credential, endpoint, or executable object; credential material lives at the
 * composition/adapter binding boundary and never in a portable model contract.
 */

/** 1–255 printable non-whitespace ASCII characters. */
const PORTABLE_ID_PATTERN = /^[!-~]{1,255}$/;

/** Logical selection intent — never a provider, deployment, or endpoint. */
export type ModelRef = OpaqueId<"model-ref">;
/** Identifies an API/service dialect (e.g. an OpenAI-compatible surface). */
export type ProviderRef = OpaqueId<"provider-ref">;
/** Identifies a configured deployment/endpoint. Contains NO credential. */
export type DeploymentRef = OpaqueId<"deployment-ref">;
/** Identity of an immutable, versioned model profile. */
export type ModelProfileId = OpaqueId<"model-profile">;

export const isPortableId = (value: unknown): value is string =>
  typeof value === "string" && PORTABLE_ID_PATTERN.test(value);

const brandId = <TKind extends string>(value: string, label: string): OpaqueId<TKind> => {
  if (!PORTABLE_ID_PATTERN.test(value)) {
    throw new TypeError(`${label} must contain 1–255 printable non-whitespace ASCII characters.`);
  }
  return value as OpaqueId<TKind>;
};

export const modelRef = (value: string): ModelRef => brandId<"model-ref">(value, "ModelRef");
export const providerRef = (value: string): ProviderRef =>
  brandId<"provider-ref">(value, "ProviderRef");
export const deploymentRef = (value: string): DeploymentRef =>
  brandId<"deployment-ref">(value, "DeploymentRef");
export const modelProfileId = (value: string): ModelProfileId =>
  brandId<"model-profile">(value, "ModelProfileId");
