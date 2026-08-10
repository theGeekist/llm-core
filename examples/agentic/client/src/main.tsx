import React from "react";
import ReactDOM from "react-dom/client";
import type { AiSdkUiProjectionChunk } from "@geekist/llm-core/adapters/ai-sdk-ui";
import "./styles.css";

// Shape-only compile fixture. See docs/interaction for common conversations and the session extension.
const exampleChunk: AiSdkUiProjectionChunk = {
  type: "text-start",
  id: "example:text",
};

function App() {
  return (
    <main>
      <h1>llm-core v2 agent projection</h1>
      <p>Qualified AI SDK UI projection chunk: {exampleChunk.type}</p>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
