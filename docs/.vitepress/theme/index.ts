import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { enhanceAppWithTabs } from "vitepress-plugin-tabs/client";
import { onMounted, watch, nextTick } from "vue";
import { useRoute } from "vitepress";
import mermaid from "mermaid";
import "./style.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    enhanceAppWithTabs(app);
  },
  setup() {
    const route = useRoute();
    const initMermaid = () => {
      mermaid.initialize({ startOnLoad: false, theme: "dark" });
      nextTick(() => {
        mermaid.run().catch((err) => console.error("Mermaid failed to run", err));
      });
    };
    onMounted(initMermaid);
    watch(
      () => route.path,
      () => nextTick(initMermaid),
    );
  },
} satisfies Theme;
