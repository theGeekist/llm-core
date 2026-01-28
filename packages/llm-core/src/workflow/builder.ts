// References: docs/implementation-plan.md#L29-L33,L79-L84; docs/workflow-notes.md

import type { RecipeName } from "./types";
import { createWorkflowHandle, type WorkflowHandle } from "./handle";

export const createBuilder = <N extends RecipeName>(recipeName: N): WorkflowHandle<N> =>
  createWorkflowHandle(recipeName);
