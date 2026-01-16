import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@geekist/llm-core/adapters/ai-sdk-ui",
        replacement: fileURLToPath(
          new URL("../../../dist/esm/src/adapters/ai-sdk-ui/index.js", import.meta.url),
        ),
      },
      {
        find: "@geekist/llm-core/adapters",
        replacement: fileURLToPath(
          new URL("../../../dist/esm/src/adapters/index.js", import.meta.url),
        ),
      },
      {
        find: /^@geekist\/llm-core$/,
        replacement: fileURLToPath(new URL("../../../dist/esm/index.js", import.meta.url)),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
});
