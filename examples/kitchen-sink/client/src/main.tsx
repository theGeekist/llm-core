/// <reference lib="dom" />
import { createRoot } from "react-dom/client";
import { App } from "./App";

const rootElement = document.getElementById("root");

if (rootElement) {
  renderApp(rootElement);
}

function renderApp(container: HTMLElement) {
  const root = createRoot(container);
  root.render(<App />);
  return true;
}
