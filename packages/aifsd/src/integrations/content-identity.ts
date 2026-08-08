import { createHash } from "node:crypto";
import { digest, type Digest } from "@geekist/llm-core/contracts";
import { canonicalize } from "@geekist/strict-json";
import type { ExecutableClosure } from "./contract.js";

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

export const integrationContentDigest = (value: unknown): Digest =>
  digest(createHash("sha256").update(canonicalize(value), "utf8").digest("hex"));

export const sameDigest = (left: Digest, right: Digest): boolean =>
  left.algorithm === right.algorithm && left.value === right.value;

export const integrationClosureDigest = (closure: ExecutableClosure): Digest => {
  if (closure.representation.kind !== "members") return integrationContentDigest(closure);
  const members = [...closure.representation.members].sort(
    (left, right) =>
      compare(left.id, right.id) ||
      compare(left.version, right.version) ||
      compare(left.digest.algorithm, right.digest.algorithm) ||
      compare(left.digest.value, right.digest.value),
  );
  return integrationContentDigest({
    root: closure.root,
    representation: { kind: "members", members },
  });
};
