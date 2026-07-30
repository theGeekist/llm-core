import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { enhanceAppWithTabs } from "vitepress-plugin-tabs/client";
import { nextTick, onMounted, watch } from "vue";
import { useData, useRoute } from "vitepress";
import mermaid from "mermaid";
import "./style.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    enhanceAppWithTabs(app);
  },
  setup() {
    const route = useRoute();
    const { isDark } = useData();
    let renderQueue = Promise.resolve();
    const renderMermaid = async () => {
      await nextTick();
      const containers = Array.from(document.querySelectorAll<HTMLElement>(".mermaid-container"));
      const nodes = containers.map((container) => {
        const source = decodeURIComponent(container.dataset.mermaidSource ?? "");
        const node = document.createElement("pre");
        node.className = "mermaid";
        node.style.whiteSpace = "pre";
        node.textContent = source;
        container.replaceChildren(node);
        return node;
      });
      if (nodes.length === 0) {
        return;
      }
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark.value ? "dark" : "default",
      });
      await mermaid.run({ nodes });
    };
    const scheduleRender = () => {
      renderQueue = renderQueue
        .then(renderMermaid)
        .catch((error: unknown) => console.error("Mermaid failed to run", error));
    };
    onMounted(scheduleRender);
    watch([() => route.path, isDark], scheduleRender);
  },
} satisfies Theme;
