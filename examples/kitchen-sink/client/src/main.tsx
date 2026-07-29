import React from "react";
import ReactDOM from "react-dom/client";
import type { AssistantUiProjectionCommand } from "@geekist/llm-core/adapters/assistant-ui";
import "./styles.css";

const command: AssistantUiProjectionCommand = {
  type: "add-message",
  message: { role: "assistant", parts: [{ type: "text", text: "Ready." }] },
};

function App() {
  return (
    <main>
      <h1>llm-core v2 UI projections</h1>
      <p>Qualified assistant-ui command: {command.type}</p>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
