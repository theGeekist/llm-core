export interface ScopeAlias {
  readonly logical: string;
  readonly physical: string;
}

const globSyntax = /[?*[\]{}]/;

const matchingAlias = (value: string, aliases: readonly ScopeAlias[]): ScopeAlias | undefined =>
  aliases
    .filter(({ physical }) => value === physical || value.startsWith(`${physical}/`))
    .sort((left, right) => right.physical.length - left.physical.length)[0];

export const canonicalScope = (value: string, aliases: readonly ScopeAlias[] = []): string => {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
  const alias = matchingAlias(normalized, aliases);
  return alias === undefined
    ? normalized
    : `${alias.logical}${normalized.slice(alias.physical.length)}`;
};

const hasGlob = (value: string): boolean => globSyntax.test(value);

const literalPrefix = (value: string): string => {
  const wildcard = value.search(globSyntax);
  return wildcard < 0 ? value : value.slice(0, wildcard);
};

const globMatches = (pattern: string, path: string): boolean => new Bun.Glob(pattern).match(path);

const globPrefixesCanIntersect = (left: string, right: string): boolean => {
  const leftPrefix = literalPrefix(left);
  const rightPrefix = literalPrefix(right);
  return leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix);
};

export const scopesOverlap = (
  left: string,
  right: string,
  aliases: readonly ScopeAlias[] = [],
): boolean => {
  const leftCanonical = canonicalScope(left, aliases);
  const rightCanonical = canonicalScope(right, aliases);
  if (leftCanonical === rightCanonical) return true;
  const leftGlob = hasGlob(leftCanonical);
  const rightGlob = hasGlob(rightCanonical);
  if (leftGlob && rightGlob) return globPrefixesCanIntersect(leftCanonical, rightCanonical);
  if (leftGlob) return globMatches(leftCanonical, rightCanonical);
  if (rightGlob) return globMatches(rightCanonical, leftCanonical);
  return false;
};
