// Deterministic content identity for configuration data and executable
// dependency closures. Canonicalization is reused from the dependency-neutral
// strict JSON boundary so AIFSD and llm-core agree on what "the same bytes"
// means; hashing is a thin SHA-256 wrapper over that canonical form (ADR-003).

import { createHash } from "node:crypto";
import { canonicalize } from "@geekist/strict-json";
import { digest, type Digest } from "@geekist/llm-core/contracts";
import type { ExecutableClosure } from "./contract.js";

const sha256Hex = (input: string): string =>
  createHash("sha256").update(input, "utf8").digest("hex");

/** SHA-256 digest of the canonical JSON form of any portable value. */
export const contentDigest = (value: unknown): Digest => digest(sha256Hex(canonicalize(value)));

export const digestsEqual = (left: Digest, right: Digest): boolean =>
  left.algorithm === right.algorithm && left.value === right.value;

/**
 * Complete executable-closure identity. Because it is derived from the whole
 * closure — root artifact plus every transitive member, or the package-manager
 * lock / bundle digest that stands in for them — changing any transitive
 * dependency changes this digest even when the root package is unchanged.
 *
 * A `members` set is an unordered collection, so members are canonicalized by
 * (id, version, digest) before hashing: reordering the same set must not change
 * executable identity.
 */
export const closureDigest = (closure: ExecutableClosure): Digest => {
  if (closure.representation.kind === "members") {
    // Locale-independent code-unit ordering: cryptographic identity must not
    // depend on the host locale, so `localeCompare` is deliberately avoided.
    const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
    const members = [...closure.representation.members].sort(
      (a, b) =>
        cmp(a.id, b.id) ||
        cmp(a.version, b.version) ||
        cmp(a.digest.algorithm, b.digest.algorithm) ||
        cmp(a.digest.value, b.digest.value),
    );
    return contentDigest({ root: closure.root, representation: { kind: "members", members } });
  }
  return contentDigest(closure);
};
