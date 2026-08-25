import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkDocumentation, markdownLinkTargets } from "./check-docs";

const roots: string[] = [];

const workspace = (): string => {
  const root = mkdtempSync(join(tmpdir(), "docs-check-"));
  roots.push(root);
  mkdirSync(join(root, "docs/.vitepress"), { recursive: true });
  mkdirSync(join(root, "packages"), { recursive: true });
  writeFileSync(join(root, "docs/.vitepress/config.mts"), "export default {}\n");
  return root;
};

const write = (root: string, path: string, content: string): void => {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Markdown link extraction", () => {
  test("extracts inline and reference destinations without reading either fence style", () => {
    expect(
      markdownLinkTargets(`
[nested](guide/name_(v2).md)
[spaced](<guide/a page.md>)
[reference][guide]

[guide]: <guide/reference page.md> "Guide"
\`[inline-ignored](inline-missing.md)\`
<!-- [comment-ignored](comment-missing.md) -->
\`\`\`
[ignored](missing.md)
[ignored-reference]: missing-reference.md
\`\`\`
~~~ts
[also-ignored](also-missing.md)
[also-ignored-reference]: also-missing-reference.md
~~~
`),
    ).toEqual(["guide/reference page.md", "guide/name_(v2).md", "guide/a page.md"]);
  });

  test("distinguishes live links from escaped syntax and every Markdown code form", () => {
    expect(
      markdownLinkTargets(
        [
          "`<!--` [after-inline-code](after.md)",
          String.raw`\` [after-escaped-backtick](escaped.md)`,
          String.raw`\[literal](not-a-link.md)`,
          "",
          "    [indented-code](indented.md)",
          "",
          "Text <!-- [comment](comment.md) --> [after-comment](visible.md)",
        ].join("\n"),
      ),
    ).toEqual(["after.md", "escaped.md", "visible.md"]);
  });

  test("extracts rendered image and GFM destinations while ignoring raw HTML attributes", () => {
    expect(
      markdownLinkTargets(
        [
          "![Diagram](images/diagram.svg)",
          "<https://example.com/reference>",
          '<a href="raw-html-missing.md">Raw HTML</a>',
          "~~[Rendered despite strikethrough](archived.md)~~",
        ].join("\n\n"),
      ),
    ).toEqual(["images/diagram.svg", "https://example.com/reference", "archived.md"]);
  });
});

describe("documentation validation", () => {
  test("discovers every existing package documentation root", async () => {
    const root = workspace();
    write(root, "docs/index.md", "[Guide](/guide)\n\n<<< @/snippets/v2/example.ts\n");
    write(root, "docs/guide.md", "# Guide\n");
    write(root, "docs/snippets/v2/example.ts", "export {};\n");
    write(root, "packages/alpha/docs/README.md", "[Missing](missing.md)\n");
    write(root, "packages/beta/docs/README.md", "[Self](./README.md)\n");

    const result = await checkDocumentation(root);

    expect(result.engineeringPageCount).toBe(2);
    expect(result.errors).toEqual([
      "packages/alpha/docs/README.md: missing relative target missing.md",
    ]);
  });

  test("skips only the approved private AIFSD documentation mount", async () => {
    const root = workspace();
    const privateRoot = mkdtempSync(join(tmpdir(), "private-package-docs-"));
    roots.push(privateRoot);
    write(root, "docs/index.md", "# Documentation\n");
    writeFileSync(join(privateRoot, "README.md"), "[Private missing](missing.md)\n");
    mkdirSync(join(root, "packages/aifsd"), { recursive: true });
    symlinkSync(privateRoot, join(root, "packages/aifsd/docs"));

    const result = await checkDocumentation(root);

    expect(result.engineeringPageCount).toBe(0);
    expect(result.errors).toEqual([]);
  });

  test("rejects a symlinked documentation root for any other package", async () => {
    const root = workspace();
    const linkedRoot = mkdtempSync(join(tmpdir(), "linked-package-docs-"));
    roots.push(linkedRoot);
    write(root, "docs/index.md", "# Documentation\n");
    writeFileSync(join(linkedRoot, "README.md"), "# Linked documentation\n");
    mkdirSync(join(root, "packages/alpha"), { recursive: true });
    symlinkSync(linkedRoot, join(root, "packages/alpha/docs"));

    const result = await checkDocumentation(root);

    expect(result.engineeringPageCount).toBe(0);
    expect(result.errors).toContain(
      "packages/alpha/docs: documentation source must not be a symlink",
    );
  });

  test("reports a missing snippet with its published source path", async () => {
    const root = workspace();
    write(root, "docs/index.md", "<<< @/snippets/v2/missing.ts\n");

    const result = await checkDocumentation(root);

    expect(result.errors).toContain("docs/index.md: missing snippet snippets/v2/missing.ts");
  });

  test("validates root and package routing Markdown without counting docs twice", async () => {
    const root = workspace();
    write(root, "docs/index.md", "# Documentation\n");
    write(root, "README.md", "[Missing](missing.md)\n");
    write(root, "CLAUDE.md", "[Documentation](docs/index.md)\n");
    write(root, "AGENTS.md", "[Documentation](docs/index.md)\n");
    write(root, "packages/alpha/README.md", "[Package docs](docs/README.md)\n");
    write(root, "packages/alpha/docs/README.md", "# Alpha docs\n");

    const result = await checkDocumentation(root);

    expect(result.publishedPageCount).toBe(1);
    expect(result.engineeringPageCount).toBe(1);
    expect(result.routingPageCount).toBe(4);
    expect(result.errors).toEqual(["README.md: missing relative target missing.md"]);
  });

  test("maps this repository's GitHub main links and skips other repositories", async () => {
    const root = workspace();
    write(
      root,
      "docs/index.md",
      [
        "[File](https://github.com/theGeekist/llm-core/blob/main/docs/guide.md)",
        "[Directory](https://github.com/theGeekist/llm-core/tree/main/packages/alpha/src)",
        "[Missing](https://github.com/theGeekist/llm-core/blob/main/docs/missing.md)",
        "[Wrong kind](https://github.com/theGeekist/llm-core/blob/main/packages/alpha/src)",
        "[External](https://github.com/example/elsewhere/blob/main/missing.md)",
      ].join("\n"),
    );
    write(root, "docs/guide.md", "# Guide\n");
    write(root, "packages/alpha/src/index.ts", "export {};\n");

    const result = await checkDocumentation(root);

    expect(result.errors).toEqual([
      "docs/index.md: missing same-repository target https://github.com/theGeekist/llm-core/blob/main/docs/missing.md",
      "docs/index.md: missing same-repository target https://github.com/theGeekist/llm-core/blob/main/packages/alpha/src",
    ]);
  });

  test("accepts a relative link to an existing workspace directory", async () => {
    const root = workspace();
    write(root, "docs/index.md", "[Source](../packages/alpha/src)\n");
    write(root, "packages/alpha/src/index.ts", "export {};\n");

    expect((await checkDocumentation(root)).errors).toEqual([]);
  });

  test("decodes local targets once and reports malformed percent encoding", async () => {
    const root = workspace();
    write(
      root,
      "docs/index.md",
      ["[Encoded](/guide%25name.md)", "[Malformed](/guide%ZZ.md)"].join("\n"),
    );
    write(root, "docs/guide%name.md", "# Encoded name\n");

    const result = await checkDocumentation(root);

    expect(result.errors).toEqual(["docs/index.md: malformed link target /guide%ZZ.md"]);
  });

  test("reports malformed percent encoding in sidebar routes", async () => {
    const root = workspace();
    write(root, "docs/index.md", "# Documentation\n");
    write(
      root,
      "docs/.vitepress/config.mts",
      'export default { themeConfig: { nav: [{ link: "/guide%ZZ" }] } };\n',
    );

    const result = await checkDocumentation(root);

    expect(result.errors).toEqual([
      "docs/.vitepress/config.mts: malformed sidebar target /guide%ZZ",
    ]);
  });

  test("reads quoted and template sidebar properties but ignores comments and strings", async () => {
    const root = workspace();
    write(root, "docs/index.md", "# Documentation\n");
    write(root, "docs/guide.md", "# Guide\n");
    write(
      root,
      "docs/.vitepress/config.mts",
      [
        "// link: '/commented-missing'",
        "const text = \"link: '/string-missing'\";",
        "export default { nav: [{ link: `/guide` }, { link: '/missing' }] };",
      ].join("\n"),
    );

    expect((await checkDocumentation(root)).errors).toEqual([
      "docs/.vitepress/config.mts: missing sidebar page /missing",
    ]);
  });

  test("rejects absolute site and sidebar routes that escape the docs root", async () => {
    const root = workspace();
    write(root, "README.md", "# Workspace\n");
    write(root, "docs/index.md", "[Escape](/../README.md)\n");
    write(
      root,
      "docs/.vitepress/config.mts",
      'export default { themeConfig: { nav: [{ link: "/../README.md" }] } };\n',
    );

    const result = await checkDocumentation(root);

    expect(result.errors).toEqual([
      "docs/index.md: missing local page /../README.md",
      "docs/.vitepress/config.mts: missing sidebar page /../README.md",
    ]);
  });

  test("rejects documentation source and target symlinks that escape their boundaries", async () => {
    const root = workspace();
    write(root, "docs/index.md", "[Outside](outside.md)\n");
    const outsideRoot = mkdtempSync(join(tmpdir(), "docs-outside-"));
    roots.push(outsideRoot);
    const outside = join(outsideRoot, "outside.md");
    writeFileSync(outside, "# Outside\n");
    symlinkSync(outside, join(root, "docs/outside.md"));

    const result = await checkDocumentation(root);

    expect(result.errors).toEqual([
      "docs/outside.md: documentation source must not be a symlink",
      "docs/index.md: missing relative target outside.md",
    ]);
  });
});
