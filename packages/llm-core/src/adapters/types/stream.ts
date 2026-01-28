import type { AdapterDiagnostic } from "./core";
import type { Document } from "./documents";
import type { ToolCall, ToolResult } from "./tools";
import type { ModelUsage } from "./model";

export type StreamEvent =
  | {
      type: "start";
      id?: string;
      modelId?: string;
      timestamp?: number;
    }
  | {
      type: "delta";
      text?: string;
      reasoning?: string;
      toolCall?: ToolCall;
      toolResult?: ToolResult;
      sources?: Document[];
      raw?: unknown;
      timestamp?: number;
    }
  | {
      type: "usage";
      usage: ModelUsage;
    }
  | {
      type: "end";
      finishReason?: string;
      text?: string;
      sources?: Document[];
      raw?: unknown;
      timestamp?: number;
      diagnostics?: AdapterDiagnostic[];
    }
  | {
      type: "error";
      error: unknown;
      diagnostics?: AdapterDiagnostic[];
      raw?: unknown;
      timestamp?: number;
    };
