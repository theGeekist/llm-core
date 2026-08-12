export const taskWorkbenchConfig = {
  commandsEndpoint: "/api/commands",
  contextEndpoint: "/api/context",
  planEndpoint: "/api/plan",
  rawEndpoint: "/api/raw",
  remediationExecuteEndpoint: "/api/remediations/execute",
  remediationPreviewEndpoint: "/api/remediations/preview",
  runEndpoint: "/api/run",
  tasksEndpoint: "/api/tasks",
} as const;
