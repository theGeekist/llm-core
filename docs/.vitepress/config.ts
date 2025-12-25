import { defineConfig } from "vitepress";
import { tabsMarkdownPlugin } from "vitepress-plugin-tabs";
import markdownItMermaid from "markdown-it-mermaid";

export default defineConfig({
  title: "llm-core",
  description: "Composable workflow + adapter core for the JS/TS LLM ecosystem.",
  base: "/",
  appearance: "dark",
  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
    ["link", { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" }],
    ["link", { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" }],
    ["meta", { property: "og:title", content: "llm-core" }],
    [
      "meta",
      {
        property: "og:description",
        content: "Composable, dependency-free TypeScript core for LLM workflows and adapters.",
      },
    ],
    ["meta", { property: "og:image", content: "https://llm-core.geekist.co/og.png" }],
    ["meta", { property: "og:url", content: "https://llm-core.geekist.co/" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],
  markdown: {
    config: (md) => {
      md.use(tabsMarkdownPlugin);
      const mermaidPlugin =
        typeof markdownItMermaid === "function"
          ? markdownItMermaid
          : (markdownItMermaid as { default?: (md: typeof md) => void }).default;
      if (mermaidPlugin) {
        md.use(mermaidPlugin);
      }
    },
  },
  themeConfig: {
    nav: [
      { text: "Docs", link: "/" },
      { text: "Guide", link: "/guide/hello-world" },
      { text: "Reference", link: "/reference/workflow-api" },
      { text: "GitHub", link: "https://github.com/theGeekist/llm-core" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Get Started",
          items: [
            { text: "Why llm-core?", link: "/guide/philosophy" },
            { text: "Your First Workflow", link: "/guide/hello-world" },
            { text: "Core Concepts", link: "/guide/core-concepts" },
            { text: "Composing Recipes", link: "/guide/composing-recipes" },
          ],
        },
        {
          text: "Recipes",
          items: [{ text: "RAG Deep Dive", link: "/recipes/rag" }],
        },
      ],
      "/reference/": [
        {
          text: "Core API",
          items: [
            { text: "Workflow API", link: "/reference/workflow-api" },
            { text: "Adapters API", link: "/reference/adapters-api" },
            { text: "Runtime Model", link: "/reference/runtime" },
          ],
        },
        {
          text: "Ecosystem",
          items: [
            { text: "Adapters Overview", link: "/reference/adapters" },
            { text: "Packs & Recipes", link: "/reference/packs-and-recipes" },
            { text: "Plugin System", link: "/reference/plugins" },
            { text: "Interop Audit", link: "/reference/interop-audit" },
          ],
        },
        {
          text: "Operations",
          items: [{ text: "Release Process", link: "/reference/release" }],
        },
      ],
      "/recipes/": [
        {
          text: "Recipes",
          items: [
            { text: "Back to Guide", link: "/guide/hello-world" },
            { text: "RAG Deep Dive", link: "/recipes/rag" },
          ],
        },
      ],
    },
  },
});
