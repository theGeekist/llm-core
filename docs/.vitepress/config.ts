import { defineConfig } from "vitepress";
import { tabsMarkdownPlugin } from "vitepress-plugin-tabs";

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
      const defaultFence =
        md.renderer.rules.fence ||
        ((tokens, idx, options, env, self) => {
          return self.renderToken(tokens, idx, options);
        });

      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        if (token.info.trim() === "mermaid") {
          // preserve whitespace for mermaid parsing
          const escapeHtml = (unsafe) => {
            return unsafe
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
          };
          return `<pre class="mermaid" style="white-space: pre;">${escapeHtml(token.content)}</pre>`;
        }
        return defaultFence(tokens, idx, options, env, self);
      };
    },
  },
  // ... rest of config ...
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
            { text: "Debugging", link: "/guide/debugging" },
            { text: "Unified Media Inputs", link: "/guide/media-inputs" },
            { text: "Deep Dive: Gems", link: "/guide/deep-dive" },
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
            { text: "Adapters API", link: "/reference/adapters-api" },
            { text: "Recipes API", link: "/reference/recipes-api" },
            { text: "Runtime Model", link: "/reference/runtime" },
            { text: "Workflow API", link: "/reference/workflow-api" },
          ],
        },
        {
          text: "Ecosystem",
          items: [
            { text: "Adapters Overview", link: "/reference/adapters" },
            {
              text: "Capabilities",
              items: [
                { text: "Models (AI SDK / LC / LI)", link: "/reference/adapters/models" },
                { text: "Retrieval (RAG)", link: "/reference/adapters/retrieval" },
                { text: "Tools & Parsers", link: "/reference/adapters/tools" },
                { text: "Storage & Memory", link: "/reference/adapters/storage" },
                { text: "Observability (Tracing)", link: "/reference/adapters/observability" },
              ],
            },
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
            { text: "Building a Chatbot", link: "/recipes/simple-chat" },
            { text: "Chatting with Data (RAG)", link: "/recipes/rag" },
            { text: "Building an Agent", link: "/recipes/agent" },
            { text: "Human-in-the-Loop", link: "/recipes/hitl" },
            { text: "The Data Pipeline", link: "/recipes/ingest" },
          ],
        },
      ],
    },
  },
});
