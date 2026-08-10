import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import ts from "typescript";
import { unified } from "unified";
import { checkArchitectureStatus } from "../packages/llm-core/scripts/check-architecture-status";

export interface DocumentationCheckResult {
  readonly errors: readonly string[];
  readonly engineeringPageCount: number;
  readonly publishedPageCount: number;
  readonly referencedSnippetCount: number;
  readonly routingPageCount: number;
}

interface WalkResult {
  readonly errors: readonly string[];
  readonly files: readonly string[];
}
const walk = async (workspaceRoot: string, directory: string): Promise<WalkResult> => {
  if ((await lstat(directory)).isSymbolicLink()) {
    return {
      errors: [`${relative(workspaceRoot, directory)}: documentation source must not be a symlink`],
      files: [],
    };
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        return {
          errors: [`${relative(workspaceRoot, path)}: documentation source must not be a symlink`],
          files: [],
        };
      }
      return entry.isDirectory()
        ? walk(workspaceRoot, path)
        : { errors: [], files: entry.isFile() ? [path] : [] };
    }),
  );
  return {
    errors: results.flatMap(({ errors }) => errors),
    files: results.flatMap(({ files }) => files),
  };
};
type PathKind = "directory" | "file" | "symlink";
const hasKind = async (path: string, kind: PathKind): Promise<boolean> => {
  try {
    const metadata = kind === "symlink" ? await lstat(path) : await stat(path);
    if (kind === "file") return metadata.isFile();
    return kind === "directory" ? metadata.isDirectory() : metadata.isSymbolicLink();
  } catch {
    return false;
  }
};
const isWithin = (boundary: string, target: string): boolean => {
  const boundaryRelative = relative(boundary, target);
  return boundaryRelative !== ".." && !boundaryRelative.startsWith(`..${sep}`);
};
const hasTypeWithin = async (
  boundary: string,
  path: string,
  expected: Exclude<PathKind, "symlink">,
): Promise<boolean> => {
  try {
    const [canonicalBoundary, canonicalPath] = await Promise.all([
      realpath(boundary),
      realpath(path),
    ]);
    return isWithin(canonicalBoundary, canonicalPath) && hasKind(canonicalPath, expected);
  } catch {
    return false;
  }
};
const existingCandidate = async (
  boundary: string,
  candidates: readonly string[],
): Promise<boolean> => {
  for (const candidate of candidates) {
    if (await hasTypeWithin(boundary, candidate, "file")) return true;
  }
  return false;
};
const pageCandidates = (docsRoot: string, decodedLink: string): string[] => {
  const clean = decodedLink.replace(/^\/+/, "");
  if (clean === "") return [join(docsRoot, "index.md")];
  return [join(docsRoot, clean), join(docsRoot, `${clean}.md`), join(docsRoot, clean, "index.md")];
};
const markdownParser = unified().use(remarkParse).use(remarkGfm);
interface MarkdownNode {
  readonly children?: readonly MarkdownNode[];
  readonly type: string;
  readonly url?: string;
}
const visitMarkdown = (node: MarkdownNode, visit: (node: MarkdownNode) => void): void => {
  visit(node);
  for (const child of node.children ?? []) visitMarkdown(child, visit);
};

/** Extract rendered inline destinations and declared reference destinations from Markdown. */
export const markdownLinkTargets = (content: string): readonly string[] => {
  const definitions: string[] = [];
  const inline: string[] = [];
  visitMarkdown(markdownParser.parse(content) as MarkdownNode, (node) => {
    if (node.url === undefined) return;
    if (node.type === "definition") definitions.push(node.url);
    else if (node.type === "link" || node.type === "image") inline.push(node.url);
  });
  return [...definitions, ...inline];
};

const isExternalTarget = (target: string): boolean =>
  target.startsWith("http://") ||
  target.startsWith("https://") ||
  target.startsWith("mailto:") ||
  target.startsWith("//") ||
  target.startsWith("#");

const pathWithoutQueryOrFragment = (target: string): string => {
  const query = target.indexOf("?");
  const fragment = target.indexOf("#");
  const boundaries = [query, fragment].filter((index) => index >= 0);
  return boundaries.length === 0 ? target : target.slice(0, Math.min(...boundaries));
};

const decodedTarget = (target: string): string | null => {
  try {
    return decodeURIComponent(pathWithoutQueryOrFragment(target));
  } catch {
    return null;
  }
};

const workspaceCandidates = (target: string): readonly string[] => [
  target,
  `${target}.md`,
  join(target, "index.md"),
  join(target, "README.md"),
];

type RepositoryGithubTarget =
  | { readonly kind: "local"; readonly target: string; readonly targetKind: "blob" | "tree" }
  | { readonly kind: "malformed" }
  | { readonly kind: "unrelated" };

const sameRepositoryGithubTarget = (rawTarget: string): RepositoryGithubTarget => {
  let url: URL;
  try {
    url = new URL(rawTarget);
  } catch {
    return { kind: "unrelated" };
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const [owner, repository, kind, branch, ...target] = segments;
  if (
    url.hostname.toLowerCase() !== "github.com" ||
    owner?.toLowerCase() !== "thegeekist" ||
    repository?.toLowerCase() !== "llm-core" ||
    (kind !== "blob" && kind !== "tree") ||
    branch !== "main"
  ) {
    return { kind: "unrelated" };
  }
  try {
    return {
      kind: "local",
      target: target.map((segment) => decodeURIComponent(segment)).join("/"),
      targetKind: kind,
    };
  } catch {
    return { kind: "malformed" };
  }
};

interface MarkdownValidationInput {
  readonly workspaceRoot: string;
  readonly docsRoot: string;
  readonly path: string;
  readonly content: string;
}

interface TargetValidationInput extends Omit<MarkdownValidationInput, "content"> {
  readonly rawTarget: string;
  readonly source: string;
}

const validateMarkdownTarget = async ({
  workspaceRoot,
  docsRoot,
  path,
  rawTarget,
  source,
}: TargetValidationInput): Promise<string | null> => {
  const repositoryTarget = sameRepositoryGithubTarget(rawTarget);
  if (repositoryTarget.kind === "malformed") return `${source}: malformed link target ${rawTarget}`;
  if (repositoryTarget.kind === "local") {
    const resolvedTarget = resolve(workspaceRoot, repositoryTarget.target);
    const exists =
      repositoryTarget.targetKind === "blob"
        ? await hasTypeWithin(workspaceRoot, resolvedTarget, "file")
        : await hasTypeWithin(workspaceRoot, resolvedTarget, "directory");
    return !isWithin(workspaceRoot, resolvedTarget) || !exists
      ? `${source}: missing same-repository target ${rawTarget}`
      : null;
  }
  if (isExternalTarget(rawTarget)) return null;

  const target = decodedTarget(rawTarget);
  if (target === null) return `${source}: malformed link target ${rawTarget}`;
  if (target.startsWith("/")) {
    return (await existingCandidate(docsRoot, pageCandidates(docsRoot, target)))
      ? null
      : `${source}: missing local page ${rawTarget}`;
  }

  const resolvedTarget = resolve(dirname(path), target);
  if (!isWithin(workspaceRoot, resolvedTarget)) {
    return `${source}: relative link escapes the workspace ${rawTarget}`;
  }
  return (await hasTypeWithin(workspaceRoot, resolvedTarget, "directory")) ||
    (await existingCandidate(workspaceRoot, workspaceCandidates(resolvedTarget)))
    ? null
    : `${source}: missing relative target ${rawTarget}`;
};

const validateMarkdownLinks = async ({
  workspaceRoot,
  docsRoot,
  path,
  content,
}: MarkdownValidationInput): Promise<string[]> => {
  const errors: string[] = [];
  const source = relative(workspaceRoot, path);

  for (const rawTarget of markdownLinkTargets(content)) {
    const error = await validateMarkdownTarget({
      workspaceRoot,
      docsRoot,
      path,
      rawTarget,
      source,
    });
    if (error !== null) errors.push(error);
  }
  return errors;
};

const packageDirectories = async (workspaceRoot: string): Promise<readonly string[]> => {
  const packagesRoot = join(workspaceRoot, "packages");
  const packages = await readdir(packagesRoot, { withFileTypes: true });
  return packages
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesRoot, entry.name));
};

const packageDocumentationRoots = async (workspaceRoot: string): Promise<readonly string[]> => {
  const candidates = (await packageDirectories(workspaceRoot)).map((path) => join(path, "docs"));
  const privateAifsdMount = join(workspaceRoot, "packages", "aifsd", "docs");
  const roots = await Promise.all(
    candidates.map(async (candidate) => {
      if (candidate === privateAifsdMount && (await hasKind(candidate, "symlink"))) {
        return null;
      }
      return (await hasKind(candidate, "directory")) ? candidate : null;
    }),
  );
  return roots.filter((candidate): candidate is string => candidate !== null);
};

const routingMarkdownPaths = async (workspaceRoot: string): Promise<WalkResult> => {
  const rootCandidates = ["README.md", "CLAUDE.md", "AGENTS.md"].map((path) =>
    join(workspaceRoot, path),
  );
  const packageCandidates = (await packageDirectories(workspaceRoot)).map((path) =>
    join(path, "README.md"),
  );
  const candidates = [...rootCandidates, ...packageCandidates];
  const results = await Promise.all(
    candidates.map(async (candidate) => {
      if (await hasKind(candidate, "symlink")) {
        return {
          error: `${relative(workspaceRoot, candidate)}: documentation source must not be a symlink`,
          path: undefined,
        };
      }
      return { error: undefined, path: (await hasKind(candidate, "file")) ? candidate : undefined };
    }),
  );
  return {
    errors: results.flatMap(({ error }) => (error === undefined ? [] : [error])),
    files: results.flatMap(({ path }) => (path === undefined ? [] : [path])),
  };
};

const validateSidebar = async (docsRoot: string): Promise<readonly string[]> => {
  const configPath = join(docsRoot, ".vitepress", "config.mts");
  if (await hasKind(configPath, "symlink")) return [];
  const errors: string[] = [];
  const config = await readFile(configPath, "utf8");
  const source = ts.createSourceFile(configPath, config, ts.ScriptTarget.Latest);
  const links: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const name =
        ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : "";
      const value = node.initializer;
      if (name === "link" && ts.isStringLiteralLike(value) && value.text.startsWith("/")) {
        links.push(value.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const link of links) {
    const decodedLink = decodedTarget(link);
    if (decodedLink === null) {
      errors.push(`docs/.vitepress/config.mts: malformed sidebar target ${link}`);
    } else if (!(await existingCandidate(docsRoot, pageCandidates(docsRoot, decodedLink)))) {
      errors.push(`docs/.vitepress/config.mts: missing sidebar page ${link}`);
    }
  }
  return errors;
};

export const checkDocumentation = async (
  workspaceRoot: string,
): Promise<DocumentationCheckResult> => {
  const docsRoot = join(workspaceRoot, "docs");
  const publishedWalk = await walk(workspaceRoot, docsRoot);
  const allDocsFiles = publishedWalk.files;
  const engineeringRoots = await packageDocumentationRoots(workspaceRoot);
  const engineeringWalks = await Promise.all(
    engineeringRoots.map(async (directory) => walk(workspaceRoot, directory)),
  );
  const engineeringMarkdown = engineeringWalks
    .flatMap(({ files }) => files)
    .filter((path) => path.endsWith(".md"));
  const publishedMarkdown = allDocsFiles.filter(
    (path) =>
      path.endsWith(".md") &&
      !path.includes(`${sep}.internal${sep}`) &&
      !path.includes(`${sep}.vitepress${sep}`),
  );
  const documentationMarkdown = new Set([...publishedMarkdown, ...engineeringMarkdown]);
  const routingWalk = await routingMarkdownPaths(workspaceRoot);
  const routingMarkdown = routingWalk.files.filter((path) => !documentationMarkdown.has(path));
  const errors: string[] = [
    ...publishedWalk.errors,
    ...engineeringWalks.flatMap(({ errors: walkErrors }) => walkErrors),
    ...routingWalk.errors,
  ];
  const architectureStatusPath = join(
    workspaceRoot,
    "packages/llm-core/docs/final-architecture/STATUS.md",
  );
  if (await hasKind(architectureStatusPath, "file")) {
    const architectureStatus = await checkArchitectureStatus({ workspaceRoot });
    errors.push(...architectureStatus.errors);
  }
  const referencedSnippets = new Set<string>();

  for (const path of publishedMarkdown) {
    const content = await readFile(path, "utf8");
    errors.push(...(await validateMarkdownLinks({ workspaceRoot, docsRoot, path, content })));
    const source = relative(workspaceRoot, path);
    for (const match of content.matchAll(/<<<\s+@\/(snippets\/[^\s{]+)/g)) {
      const snippet = match[1]!;
      referencedSnippets.add(snippet);
      if (!(await hasKind(join(docsRoot, snippet), "file"))) {
        errors.push(`${source}: missing snippet ${snippet}`);
      }
    }
  }

  for (const path of [...engineeringMarkdown, ...routingMarkdown]) {
    const content = await readFile(path, "utf8");
    errors.push(...(await validateMarkdownLinks({ workspaceRoot, docsRoot, path, content })));
  }
  errors.push(...(await validateSidebar(docsRoot)));

  const snippetFiles = allDocsFiles
    .filter((path) => path.includes(`${sep}snippets${sep}v2${sep}`) && path.endsWith(".ts"))
    .map((path) => relative(docsRoot, path).split(sep).join("/"));
  for (const snippet of snippetFiles) {
    if (!referencedSnippets.has(snippet)) {
      errors.push(`docs/${snippet}: checked snippet is not embedded by a published page`);
    }
  }

  return {
    errors,
    engineeringPageCount: engineeringMarkdown.length,
    publishedPageCount: publishedMarkdown.length,
    referencedSnippetCount: referencedSnippets.size,
    routingPageCount: routingMarkdown.length,
  };
};

if (import.meta.main) {
  const workspaceRoot = resolve(import.meta.dir, "..");
  const result = await checkDocumentation(workspaceRoot);
  if (result.errors.length > 0) {
    console.error(result.errors.join("\n"));
    process.exit(1);
  }
  console.log(
    `Verified ${result.publishedPageCount} published pages, ${result.engineeringPageCount} package engineering pages, ${result.routingPageCount} routing pages, ${result.referencedSnippetCount} embedded snippets, and all sidebar links.`,
  );
}
