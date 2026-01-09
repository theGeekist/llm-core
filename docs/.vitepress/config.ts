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
          const escapeHtml = (unsafe: string) => {
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

      const defaultHighlight = md.options.highlight;
      md.options.highlight = (str, lang, attrs) => {
        if (/^(ts|typescript|js|javascript)/.test(lang)) {
          str = str.replace(
            /from\s+["']#(adapters|recipes|workflow|interaction)(.*?)["']/g,
            (match, p1, p2) => `from "@geekist/llm-core/${p1}${p2}"`,
          );
        }
        if (defaultHighlight) {
          return defaultHighlight(str, lang, attrs);
        }
        return ""; // should not happen
      };
    },
  },
  // ... rest of config ...
  themeConfig: {
    nav: [
      { text: "Recipes", link: "/recipes/simple-chat" },
      { text: "Adapters", link: "/adapters/" },
      { text: "Interaction", link: "/interaction/" },
      { text: "Reference", link: "/reference/recipes-api" },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/theGeekist/llm-core" }],
    sidebar: {
      "/guide/": [
        {
          text: "Quick Start",
          items: [
            { text: "Single-Turn Interaction", link: "/guide/interaction-single-turn" },
            { text: "Sessions + Transport", link: "/guide/interaction-sessions" },
            { text: "End-to-End UI", link: "/guide/end-to-end-ui" },
            { text: "Workflow Orchestration", link: "/guide/hello-world" },
          ],
        },
        {
          text: "Fundamentals",
          items: [
            { text: "Core Concepts", link: "/guide/core-concepts" },
            { text: "Why llm-core?", link: "/guide/philosophy" },
          ],
        },
        {
          text: "Techniques",
          items: [
            { text: "Composing Recipes", link: "/guide/composing-recipes" },
            { text: "Debugging", link: "/guide/debugging" },
            { text: "Unified Media Inputs", link: "/guide/media-inputs" },
          ],
        },
        {
          text: "Architecture",
          items: [
            { text: "Advanced Features", link: "/guide/advanced-features" },
            { text: "Plugin System", link: "/reference/plugins" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Core API",
          items: [
            { text: "Recipes API", link: "/reference/recipes-api" },
            { text: "Adapters API", link: "/reference/adapters-api" },
          ],
        },
        {
          text: "Framework Internals",
          collapsed: true,
          items: [
            { text: "Workflow API", link: "/reference/workflow-api" },
            { text: "Runtime Model", link: "/reference/runtime" },
            { text: "Composition Model", link: "/reference/composition-model" },
          ],
        },
        {
          text: "Ecosystem",
          items: [
            {
              text: "Capabilities",
              items: [
                { text: "Models (AI SDK / LC / LI)", link: "/adapters/models" },
                { text: "Tools & Parsers", link: "/adapters/tools" },
                { text: "Retrieval (RAG)", link: "/adapters/retrieval" },
                { text: "Storage & Memory", link: "/adapters/storage" },
                { text: "Observability (Tracing)", link: "/adapters/observability" },
              ],
            },

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
            { text: "Looping & Iteration", link: "/recipes/loop" },
            { text: "Evaluation & Scoring", link: "/recipes/eval" },
          ],
        },
      ],
      "/adapters/": [
        {
          text: "Adapters",
          items: [
            { text: "Overview", link: "/adapters/" },
            { text: "Models (AI SDK / LC / LI)", link: "/adapters/models" },
            { text: "Tools & Parsers", link: "/adapters/tools" },
            { text: "Retrieval (RAG)", link: "/adapters/retrieval" },
            { text: "Storage & Memory", link: "/adapters/storage" },
            { text: "UI SDK Adapters", link: "/adapters/ui-sdk" },
            { text: "Observability (Tracing)", link: "/adapters/observability" },
          ],
        },
      ],
      "/interaction/": [
        {
          text: "Interaction",
          items: [
            { text: "Overview", link: "/interaction/" },
            { text: "Pipeline", link: "/interaction/pipeline" },
            { text: "Reducer", link: "/interaction/reducer" },
            { text: "Sessions", link: "/interaction/session" },
            { text: "Transport", link: "/interaction/transport" },
            { text: "Host", link: "/interaction/host-glue" },
          ],
        },
      ],
    },
  },
});
