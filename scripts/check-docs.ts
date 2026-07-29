import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dir, "..");
const docsRoot = join(root, "docs");

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return walk(path);
      }
      return [path];
    }),
  );
  return paths.flat();
};

const allDocsFiles = await walk(docsRoot);
const publishedMarkdown = allDocsFiles.filter(
  (path) =>
    path.endsWith(".md") &&
    !path.includes(`${sep}.internal${sep}`) &&
    !path.includes(`${sep}.vitepress${sep}`),
);

const exists = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

const pageCandidates = (link: string): string[] => {
  const clean = decodeURIComponent(link).replace(/^\/+/, "");
  if (clean === "") {
    return [join(docsRoot, "index.md")];
  }
  return [join(docsRoot, clean), join(docsRoot, `${clean}.md`), join(docsRoot, clean, "index.md")];
};

const errors: string[] = [];
const referencedSnippets = new Set<string>();

for (const path of publishedMarkdown) {
  const content = await readFile(path, "utf8");
  const source = relative(root, path);

  for (const match of content.matchAll(/\]\((\/[^)\s#]*)(?:#[^)]*)?\)/g)) {
    const link = match[1];
    const candidates = pageCandidates(link);
    if (
      !(await Promise.any(
        candidates.map(async (candidate) =>
          (await exists(candidate)) ? candidate : Promise.reject(),
        ),
      ).catch(() => undefined))
    ) {
      errors.push(`${source}: missing local page ${link}`);
    }
  }

  for (const match of content.matchAll(/<<<\s+@\/(snippets\/[^\s{]+)/g)) {
    const snippet = match[1];
    referencedSnippets.add(snippet);
    if (!(await exists(join(docsRoot, snippet)))) {
      errors.push(`${source}: missing snippet ${snippet}`);
    }
  }
}

const configPath = join(docsRoot, ".vitepress", "config.mts");
const config = await readFile(configPath, "utf8");
for (const match of config.matchAll(/link:\s*["'](\/[^"'#]*)/g)) {
  const link = match[1];
  const candidates = pageCandidates(link);
  if (
    !(await Promise.any(
      candidates.map(async (candidate) =>
        (await exists(candidate)) ? candidate : Promise.reject(),
      ),
    ).catch(() => undefined))
  ) {
    errors.push(`docs/.vitepress/config.mts: missing sidebar page ${link}`);
  }
}

const snippetFiles = allDocsFiles
  .filter((path) => path.includes(`${sep}snippets${sep}v2${sep}`) && path.endsWith(".ts"))
  .map((path) => relative(docsRoot, path).split(sep).join("/"));

for (const snippet of snippetFiles) {
  if (!referencedSnippets.has(snippet)) {
    errors.push(`docs/${snippet}: checked snippet is not embedded by a published page`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Verified ${publishedMarkdown.length} published pages, ${referencedSnippets.size} embedded snippets, and all sidebar links.`,
);
