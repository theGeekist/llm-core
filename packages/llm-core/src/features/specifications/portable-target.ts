import type { ContractVersion, ExtensionNamespace, JsonObject, JsonValue } from "#contracts";
import { isContractVersion, isExtensionNamespace, isJsonValue } from "#contracts";
import { cloneFrozen } from "#shared/portable-data";

/**
 * Compile-time projection of a target into portable data. Runtime validation
 * remains authoritative and rejects cycles, accessors, sparse arrays, and
 * non-JSON built-ins that structural typing cannot identify.
 */
export type PortableSpecificationTarget<T = JsonValue> = T extends (...args: never[]) => unknown
  ? never
  : T extends string | number | boolean | null | undefined
    ? T
    : T extends readonly (infer TItem)[]
      ? readonly PortableSpecificationTarget<TItem>[]
      : T extends object
        ? { readonly [TKey in keyof T]: PortableSpecificationTarget<T[TKey]> }
        : never;

/**
 * A serialized reference resolved only by the named integration. It never
 * contains a live framework graph, callback, client, provider, or process.
 */
export type PortableIntegrationReference = JsonObject & {
  readonly kind: "integration-reference";
  readonly integration: ExtensionNamespace;
  readonly reference: string;
  readonly version?: ContractVersion;
  readonly metadata?: JsonValue;
};

export interface PortableIntegrationReferenceInput {
  readonly integration: ExtensionNamespace;
  readonly reference: string;
  readonly version?: ContractVersion;
  readonly metadata?: JsonValue;
}

export const createPortableIntegrationReference = (
  input: PortableIntegrationReferenceInput,
): PortableIntegrationReference => {
  if (!isExtensionNamespace(input.integration)) {
    throw new TypeError("Portable integration references require a reverse-DNS integration ID.");
  }
  if (typeof input.reference !== "string" || input.reference.trim().length === 0) {
    throw new TypeError("Portable integration references require a non-blank opaque reference.");
  }
  if (input.version !== undefined && !isContractVersion(input.version)) {
    throw new TypeError("Portable integration reference versions must be SemVer.");
  }
  if (input.metadata !== undefined && !isJsonValue(input.metadata)) {
    throw new TypeError("Portable integration reference metadata must be JSON data.");
  }
  return cloneFrozen({
    kind: "integration-reference",
    integration: input.integration,
    reference: input.reference,
    ...(input.version === undefined ? {} : { version: input.version }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  }) as PortableIntegrationReference;
};
