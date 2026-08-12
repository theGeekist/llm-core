import React from "react";
import ReactDOM from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { TaskWorkbenchScene } from "./scenes/web/TaskWorkbenchScene";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TaskWorkbenchScene />
  </React.StrictMode>,
);
