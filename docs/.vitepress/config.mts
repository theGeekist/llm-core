import { defineConfig } from "vitepress";
import { tabsMarkdownPlugin } from "vitepress-plugin-tabs";

export default defineConfig({
  title: "llm-core",
  description: "Portable contracts and controlled orchestration for LLM applications.",
  base: "/",
  appearance: "dark",
  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
    ["meta", { property: "og:title", content: "llm-core" }],
    [
      "meta",
      {
        property: "og:description",
        content: "Portable contracts and controlled orchestration for LLM applications.",
      },
    ],
  ],
  markdown: {
    config: (markdown) => {
      markdown.use(tabsMarkdownPlugin);
    },
  },
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/hello-world" },
      { text: "Capabilities", link: "/capabilities/" },
      { text: "Adapters", link: "/adapters/" },
      { text: "Interaction", link: "/interaction/" },
      { text: "Reference", link: "/reference/vocabulary" },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/theGeekist/llm-core" }],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Get started", link: "/guide/hello-world" },
            { text: "Core concepts", link: "/guide/core-concepts" },
            { text: "Run an agent", link: "/guide/agent" },
            { text: "Resume a workflow", link: "/guide/workflow" },
            { text: "Why llm-core?", link: "/guide/philosophy" },
          ],
        },
      ],
      "/capabilities/": [
        {
          text: "Capabilities",
          items: [
            { text: "Overview", link: "/capabilities/" },
            { text: "Bindings and composition", link: "/capabilities/bindings" },
            { text: "Models", link: "/capabilities/model" },
            { text: "Storage and memory", link: "/capabilities/storage-memory" },
            {
              text: "Retrieval and indexing",
              link: "/capabilities/retrieval-indexing",
            },
            { text: "Tools and control", link: "/capabilities/tools-control" },
            { text: "Evidence and state", link: "/capabilities/evidence-state" },
          ],
        },
      ],
      "/adapters/": [
        {
          text: "Adapters",
          items: [{ text: "Qualified adapters", link: "/adapters/" }],
        },
      ],
      "/interaction/": [
        {
          text: "Interaction",
          items: [{ text: "Sessions and projections", link: "/interaction/" }],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Vocabulary", link: "/reference/vocabulary" },
            { text: "Contracts and portability", link: "/reference/contracts" },
            { text: "Package exports", link: "/reference/package-exports" },
            { text: "1.x to 2.0", link: "/reference/migration-2" },
          ],
        },
      ],
    },
  },
});
