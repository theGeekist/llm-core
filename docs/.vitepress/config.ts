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
      md.use(markdownItMermaid);
    },
  },
  themeConfig: {
    nav: [
      { text: "Docs", link: "/" },
      { text: "Workflow", link: "/workflow-api" },
      { text: "Adapters", link: "/adapters-api" },
      { text: "GitHub", link: "https://github.com/theGeekist/llm-core" },
    ],
    sidebar: [
      {
        text: "Start",
        items: [
          { text: "Overview", link: "/" },
          { text: "Workflow API", link: "/workflow-api" },
          { text: "Adapters API", link: "/adapters-api" },
        ],
      },
      {
        text: "Runtime",
        items: [
          { text: "Runtime", link: "/runtime" },
          { text: "Recipes + Plugins", link: "/recipes-and-plugins" },
          { text: "Plugins", link: "/plugins" },
        ],
      },
      {
        text: "Adapters",
        items: [
          { text: "Adapters", link: "/adapters" },
          { text: "Adapters API", link: "/adapters-api" },
        ],
      },
      {
        text: "Operations",
        items: [{ text: "Release Process", link: "/release" }],
      },
    ],
  },
});
