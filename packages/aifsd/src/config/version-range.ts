// SemVer parsing/compare and the version-range matcher used by resolution.
// Only the exact, caret and wildcard forms are supported; everything else is
// reported as unsupported rather than guessed at. Components use arbitrary
// precision so distinct valid numeric identifiers never collapse together.

export interface SemVer {
  readonly major: bigint;
  readonly minor: bigint;
  readonly patch: bigint;
}

export const parseSemVer = (value: string): SemVer | null => {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) {
    return null;
  }
  return { major: BigInt(match[1]!), minor: BigInt(match[2]!), patch: BigInt(match[3]!) };
};

const comparePart = (left: bigint, right: bigint): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const compareSemVer = (a: SemVer, b: SemVer): number =>
  comparePart(a.major, b.major) || comparePart(a.minor, b.minor) || comparePart(a.patch, b.patch);

// Caret pins the left-most non-zero component: ^1.2.3 -> <2.0.0,
// ^0.2.3 -> <0.3.0, ^0.0.3 -> <0.0.4.
const caretUpperBound = (base: SemVer): SemVer => {
  if (base.major > 0n) {
    return { major: base.major + 1n, minor: 0n, patch: 0n };
  }
  if (base.minor > 0n) {
    return { major: 0n, minor: base.minor + 1n, patch: 0n };
  }
  return { major: 0n, minor: 0n, patch: base.patch + 1n };
};

export type RangeMatcher =
  | { readonly kind: "ok"; readonly test: (version: SemVer) => boolean }
  | { readonly kind: "unsupported" };

export const rangeMatcher = (range: string): RangeMatcher => {
  if (range === "*") {
    return { kind: "ok", test: () => true };
  }
  const exact = parseSemVer(range);
  if (exact) {
    return { kind: "ok", test: (version) => compareSemVer(version, exact) === 0 };
  }
  if (range.startsWith("^")) {
    const base = parseSemVer(range.slice(1));
    if (base) {
      const upper = caretUpperBound(base);
      return {
        kind: "ok",
        test: (version) => compareSemVer(version, base) >= 0 && compareSemVer(version, upper) < 0,
      };
    }
  }
  return { kind: "unsupported" };
};
