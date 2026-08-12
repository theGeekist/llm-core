import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  executeWorkbenchCommand,
  rawTask,
  taskContext,
  taskPlan,
  workbenchCommands,
} from "./server/task-data";
import {
  executeWorkspaceRemediation,
  previewWorkspaceRemediation,
} from "./server/features/remediation/public";
import { readArchitectureDocument } from "./server/features/documents/public";
import { createArchitectureTask } from "./server/features/task-authoring/public";
import type { WorkspaceRemediationInput } from "./shared/remediation-contract";
import type { CreateTaskInput } from "./shared/task-authoring-contract";

const json = (response: ServerResponse<IncomingMessage>, value: unknown, status = 200): void => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
};

const taskArgument = (request: Connect.IncomingMessage): string => {
  const url = new URL(request.url ?? "", "https://architect.local.geekist.co");
  return url.searchParams.get("task") ?? "";
};

const documentArgument = (request: Connect.IncomingMessage): string => {
  const url = new URL(request.url ?? "", "https://architect.local.geekist.co");
  return url.searchParams.get("path") ?? "";
};

const requestBody = async (request: Connect.IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
};

const api = (): Plugin => ({
  name: "task-workbench-api",
  configurePreviewServer: ({ middlewares }) => register(middlewares),
  configureServer: ({ middlewares }) => register(middlewares),
});

const register = (middlewares: Connect.Server): void => {
  middlewares.use("/api/plan", (_request, response) => {
    try {
      json(response, taskPlan());
    } catch (error) {
      json(response, { error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });
  middlewares.use("/api/context", (request, response) => {
    try {
      json(response, { content: taskContext(taskArgument(request)) });
    } catch (error) {
      json(response, { error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
  middlewares.use("/api/commands", (_request, response) => {
    json(response, { commands: workbenchCommands() });
  });
  middlewares.use("/api/run", (request, response) => {
    requestBody(request)
      .then(async ({ id, task }) =>
        executeWorkbenchCommand(
          typeof id === "string" ? id : "",
          typeof task === "string" ? task : null,
        ),
      )
      .then((result) => json(response, result))
      .catch((error: unknown) => {
        json(response, { error: error instanceof Error ? error.message : String(error) }, 400);
      });
  });
  middlewares.use("/api/remediations/preview", (request, response) => {
    requestBody(request)
      .then((body) => previewWorkspaceRemediation(body as unknown as WorkspaceRemediationInput))
      .then((result) => json(response, result))
      .catch((error: unknown) => {
        json(response, { error: error instanceof Error ? error.message : String(error) }, 400);
      });
  });
  middlewares.use("/api/remediations/execute", (request, response) => {
    requestBody(request)
      .then(({ token }) => {
        if (typeof token !== "string") throw new Error("Preview token is required");
        return executeWorkspaceRemediation(token, taskPlan);
      })
      .then((result) => json(response, result))
      .catch((error: unknown) => {
        json(response, { error: error instanceof Error ? error.message : String(error) }, 409);
      });
  });
  middlewares.use("/api/tasks", (request, response) => {
    requestBody(request)
      .then((body) => createArchitectureTask(body as unknown as CreateTaskInput, taskPlan))
      .then((result) => json(response, result, 201))
      .catch((error: unknown) => {
        json(response, { error: error instanceof Error ? error.message : String(error) }, 409);
      });
  });
  middlewares.use("/api/raw", (request, response) => {
    rawTask(taskArgument(request))
      .then((content) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(content);
      })
      .catch((error: unknown) => {
        json(response, { error: error instanceof Error ? error.message : String(error) }, 400);
      });
  });
  middlewares.use("/api/document", (request, response) => {
    try {
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/markdown; charset=utf-8");
      response.end(readArchitectureDocument(documentArgument(request)));
    } catch (error) {
      json(response, { error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
};

export default defineConfig({
  plugins: [react(), api()],
  preview: { host: "127.0.0.1", port: 5184, strictPort: true },
  server: {
    allowedHosts: ["architect.local.geekist.co"],
    host: "127.0.0.1",
    port: 5184,
    strictPort: true,
  },
});
