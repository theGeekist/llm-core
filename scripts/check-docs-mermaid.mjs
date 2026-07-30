import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "docs", ".vitepress", "dist");

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walk(path) : [path];
      }),
    )
  ).flat();
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const resolveRequest = async (requestUrl) => {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const requested = normalize(pathname).replace(/^[/\\]+/, "");
  const candidates =
    requested === ""
      ? [join(dist, "index.html")]
      : [
          join(dist, requested),
          join(dist, `${requested}.html`),
          join(dist, requested, "index.html"),
        ];

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (!resolved.startsWith(`${dist}/`) && resolved !== dist) continue;
    try {
      if ((await stat(resolved)).isFile()) return resolved;
    } catch {
      // Try the next VitePress path shape.
    }
  }
  return undefined;
};

const server = createServer(async (request, response) => {
  const path = await resolveRequest(request.url ?? "/");
  if (!path) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": contentTypes[extname(path)] ?? "application/octet-stream",
  });
  response.end(await readFile(path));
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
if (address === null || typeof address === "string") {
  throw new Error("Documentation smoke server did not expose a TCP port.");
}

const htmlFiles = (await walk(dist)).filter(
  (path) => path.endsWith(".html") && !path.endsWith("404.html"),
);
const routes = htmlFiles.map((path) => {
  const page = relative(dist, path).replaceAll("\\", "/");
  if (page === "index.html") return "/";
  return `/${page.replace(/(?:\/index)?\.html$/, "")}`;
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
let diagrams = 0;
let themeChecked = false;

page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console error: ${message.text()}`);
});

try {
  for (const route of routes) {
    await page.goto(`http://127.0.0.1:${address.port}${route}`, {
      waitUntil: "networkidle",
    });
    const count = await page.locator(".mermaid").count();
    if (count === 0) continue;
    diagrams += count;
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".mermaid")].every(
          (element) => element.querySelector("svg") !== null,
        ),
      undefined,
      { timeout: 10_000 },
    );

    if (!themeChecked) {
      const darkDiagram = await page.locator(".mermaid svg").first().innerHTML();
      await page.evaluate(() => localStorage.setItem("vitepress-theme-appearance", "light"));
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForFunction(
        () =>
          !document.documentElement.classList.contains("dark") &&
          [...document.querySelectorAll(".mermaid")].every(
            (element) => element.querySelector("svg") !== null,
          ),
      );
      const lightDiagram = await page.locator(".mermaid svg").first().innerHTML();
      if (lightDiagram === darkDiagram) {
        errors.push(`theme rerender did not change Mermaid output on ${route}`);
      }
      themeChecked = true;
    }
  }
} finally {
  await browser.close();
  await new Promise((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
}

if (errors.length > 0) {
  throw new Error(errors.join("\n"));
}
if (diagrams === 0 || !themeChecked) {
  throw new Error("No rendered Mermaid diagram was available for the theme smoke check.");
}

console.log(`Rendered ${diagrams} Mermaid diagrams across ${routes.length} pages in Chromium.`);
