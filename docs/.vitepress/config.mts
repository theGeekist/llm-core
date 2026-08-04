import { defineConfig } from "vitepress";
import { tabsMarkdownPlugin } from "vitepress-plugin-tabs";

export default defineConfig({
  title: "llm-core",
  description: "Portable contracts, conformance, authority, and evidence for AI applications.",
  base: "/",
  appearance: "dark",
  srcExclude: ["**/internal/**", "**/handoffs/**"],
  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
    ["link", { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" }],
    ["link", { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" }],
    ["meta", { property: "og:title", content: "llm-core" }],
    [
      "meta",
      {
        property: "og:description",
        content: "Portable contracts, conformance, authority, and evidence for AI applications.",
      },
    ],
    ["meta", { property: "og:image", content: "https://llm-core.geekist.co/og.png" }],
    ["meta", { property: "og:url", content: "https://llm-core.geekist.co/" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],
  markdown: {
    config: (markdown) => {
      markdown.use(tabsMarkdownPlugin);
      const defaultFence =
        markdown.renderer.rules.fence ??
        ((tokens, index, options, _environment, renderer) =>
          renderer.renderToken(tokens, index, options));

      markdown.renderer.rules.fence = (tokens, index, options, environment, renderer) => {
        const token = tokens[index];
        if (token.info.trim() !== "mermaid") {
          return defaultFence(tokens, index, options, environment, renderer);
        }

        const content = token.content
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
        const source = encodeURIComponent(token.content);
        return `<div class="mermaid-container" data-mermaid-source="${source}"><pre class="mermaid" style="white-space: pre;">${content}</pre></div>`;
      };
    },
  },
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/hello-world" },
      { text: "Capabilities", link: "/capabilities/" },
      { text: "Orchestration", link: "/orchestration/" },
      { text: "Conversations", link: "/interaction/" },
      { text: "Adapters", link: "/adapters/" },
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
            { text: "Integrate an agent runtime", link: "/guide/agent" },
            { text: "Describe workflow intent", link: "/guide/workflow" },
            { text: "Project an interaction", link: "/interaction/" },
            { text: "Why llm-core?", link: "/guide/philosophy" },
            { text: "Migrate from 1.x", link: "/reference/migration-2" },
          ],
        },
      ],
      "/capabilities/": [
        {
          text: "Capabilities",
          items: [
            { text: "Overview", link: "/capabilities/" },
            { text: "Contracts and portability", link: "/capabilities/contracts" },
            { text: "Model and media", link: "/capabilities/model" },
            { text: "Tools", link: "/capabilities/tools" },
            { text: "Control", link: "/capabilities/control" },
            { text: "Evidence", link: "/capabilities/evidence" },
            { text: "State and durability", link: "/capabilities/state" },
            { text: "Context", link: "/capabilities/context" },
            { text: "Artifacts", link: "/capabilities/artifacts" },
            { text: "Evaluation", link: "/capabilities/evaluation" },
            {
              text: "Agent capabilities",
              link: "/capabilities/agent",
              items: [
                { text: "Bindings and composition", link: "/capabilities/bindings" },
                { text: "Agent skills", link: "/capabilities/agent-skills" },
                {
                  text: "Retrieval and indexing",
                  link: "/capabilities/retrieval-indexing",
                },
                { text: "Storage and memory", link: "/capabilities/storage-memory" },
              ],
            },
          ],
        },
      ],
      "/orchestration/": [
        {
          text: "Orchestration",
          items: [
            { text: "Overview", link: "/orchestration/" },
            { text: "Workflows", link: "/orchestration/workflows" },
            {
              text: "Controlled tool execution",
              link: "/orchestration/controlled-tool-execution",
            },
            { text: "Composition patterns", link: "/orchestration/composition-patterns" },
          ],
        },
      ],
      "/interaction/": [
        {
          text: "Conversations and interaction",
          items: [
            { text: "Overview", link: "/interaction/" },
            { text: "Events and projections", link: "/interaction/events" },
            { text: "Sessions", link: "/interaction/sessions" },
            { text: "Reconnect and transport", link: "/interaction/transport" },
          ],
        },
      ],
      "/adapters/": [
        {
          text: "Adapters",
          items: [
            { text: "Overview", link: "/adapters/" },
            { text: "AI SDK model", link: "/adapters/ai-sdk" },
            { text: "UI projections", link: "/adapters/ui" },
            { text: "Runtime conformance", link: "/adapters/runtime-conformance" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Vocabulary", link: "/reference/vocabulary" },
            { text: "API by subpath", link: "/reference/api" },
            { text: "Failures and diagnostics", link: "/reference/failures" },
            { text: "Contract catalogue", link: "/reference/contracts" },
            { text: "Package exports", link: "/reference/package-exports" },
            { text: "Packaging and conformance", link: "/reference/conformance" },
            { text: "Design decisions", link: "/reference/design-decisions" },
            { text: "1.x to 2.0", link: "/reference/migration-2" },
          ],
        },
      ],
    },
  },
});
