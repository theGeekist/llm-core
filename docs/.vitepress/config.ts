import { defineConfig } from "vitepress";

export default defineConfig({
  title: "llm-core",
  description: "Composable workflow + adapter core for the JS/TS LLM ecosystem.",
  base: "/llm-core/",
  themeConfig: {
    nav: [
      { text: "Docs", link: "/" },
      { text: "Workflow API", link: "/workflow-api" },
      { text: "Adapters API", link: "/adapters-api" },
      { text: "GitHub", link: "https://github.com/theGeekist/llm-core" },
    ],
    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Overview", link: "/" },
          { text: "Workflow API", link: "/workflow-api" },
          { text: "Adapters API", link: "/adapters-api" },
        ],
      },
      {
        text: "Core",
        items: [
          { text: "Runtime", link: "/runtime" },
          { text: "Recipes + Plugins", link: "/recipes-and-plugins" },
          { text: "Plugins", link: "/plugins" },
          { text: "Workflow Notes", link: "/workflow-notes" },
        ],
      },
      {
        text: "Roadmap",
        items: [
          { text: "Implementation Plan", link: "/implementation-plan" },
          { text: "Stage 10b", link: "/stage-10b" },
          { text: "Stage 8b", link: "/stage-8b" },
          { text: "Stage 9", link: "/stage-9" },
          { text: "Stage 10", link: "/stage-10" },
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
