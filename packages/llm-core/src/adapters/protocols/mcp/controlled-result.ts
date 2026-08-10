import type { PortableContent, ToolCallId } from "#contracts";
import { canonicalize } from "@aifsd/strict-json";
import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/server";
import type { ControlledToolExecutionOutcome } from "../../../tools/runtime";

const resultResourceUri = (toolCallId: ToolCallId, index: number): string =>
  `urn:llm-core:tool-result:${encodeURIComponent(toolCallId)}:${index}`;

const projectContent = (
  toolCallId: ToolCallId,
  content: PortableContent,
  index: number,
): ContentBlock => {
  switch (content.kind) {
    case "text":
      return { type: "text", text: content.text };
    case "json":
      return { type: "text", text: canonicalize(content.value) };
    case "binary":
      return {
        type: "resource",
        resource: {
          uri: resultResourceUri(toolCallId, index),
          mimeType: content.mediaType,
          blob: content.data,
        },
      };
    case "media-ref":
      return {
        type: "resource_link",
        uri: `urn:llm-core:resource:${encodeURIComponent(content.resource.resourceId)}`,
        name: content.altText ?? content.resource.resourceId,
        mimeType: content.mediaType,
      };
    default:
      throw new TypeError("Unsupported portable tool content.");
  }
};

const controlledFailure = (status: ControlledToolExecutionOutcome["status"]): CallToolResult => ({
  content: [{ type: "text", text: `llm-core.controlled-tool.${status}` }],
  isError: true,
});

/** Closed projection from the kernel outcome union into the MCP result union. */
export const projectControlledToolOutcome = (
  outcome: ControlledToolExecutionOutcome,
): CallToolResult => {
  if (outcome.status === "succeeded") {
    const json = outcome.result.content.filter((content) => content.kind === "json");
    const structuredContent =
      json.length === 1 &&
      typeof json[0]!.value === "object" &&
      json[0]!.value !== null &&
      !Array.isArray(json[0]!.value)
        ? json[0]!.value
        : undefined;
    return {
      content: outcome.result.content.map((content, index) =>
        projectContent(outcome.result.toolCallId, content, index),
      ),
      ...(structuredContent === undefined ? {} : { structuredContent }),
    };
  }
  return controlledFailure(outcome.status);
};

export const controlledToolBoundaryFailure = (): CallToolResult =>
  controlledFailure("indeterminate");
