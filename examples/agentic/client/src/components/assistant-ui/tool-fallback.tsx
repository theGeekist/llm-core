import type { ToolCallMessagePartComponent, ToolCallMessagePartProps } from "@assistant-ui/react";
import { bindFirst } from "@geekist/llm-core";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, XCircleIcon } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useId, useState } from "react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

type ToolFallbackProps = ToolCallMessagePartProps;

const applyToggleCollapsed = (value: boolean) => !value;

const toggleCollapsed = (setIsCollapsed: Dispatch<SetStateAction<boolean>>) => {
  setIsCollapsed(applyToggleCollapsed);
  return true;
};

const safeStringify = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const safeStringifyPretty = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return safeStringify(value);
  }
};

const ToolFallbackImpl = ({ toolName, argsText, result, status }: ToolFallbackProps) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const contentId = useId();
  const handleToggleCollapsed = bindFirst(toggleCollapsed, setIsCollapsed);

  const isCancelled = status?.type === "incomplete" && status.reason === "cancelled";
  const cancelledReason = isCancelled && status.error ? safeStringify(status.error) : null;

  return (
    <div
      className={cn(
        "aui-tool-fallback-root mb-4 flex w-full flex-col gap-3 rounded-lg border py-3",
        isCancelled && "border-muted-foreground/30 bg-muted/30",
      )}
    >
      <div className="aui-tool-fallback-header flex items-center gap-2 px-4">
        {isCancelled ? (
          <XCircleIcon className="aui-tool-fallback-icon size-4 text-muted-foreground" />
        ) : (
          <CheckIcon className="aui-tool-fallback-icon size-4" />
        )}
        <p
          className={cn(
            "aui-tool-fallback-title grow",
            isCancelled && "text-muted-foreground line-through",
          )}
        >
          {isCancelled ? "Cancelled tool: " : "Used tool: "}
          <b>{toolName}</b>
        </p>
        <Button
          onClick={handleToggleCollapsed}
          size="icon"
          variant="ghost"
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
          aria-label={isCollapsed ? "Expand tool details" : "Collapse tool details"}
        >
          {isCollapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Button>
      </div>
      {!isCollapsed && (
        <div id={contentId} className="aui-tool-fallback-content flex flex-col gap-2 border-t pt-2">
          {cancelledReason && (
            <div className="aui-tool-fallback-cancelled-root px-4">
              <p className="aui-tool-fallback-cancelled-header font-semibold text-muted-foreground">
                Cancelled reason:
              </p>
              <p className="aui-tool-fallback-cancelled-reason text-muted-foreground">
                {cancelledReason}
              </p>
            </div>
          )}
          <div className={cn("aui-tool-fallback-args-root px-4", isCancelled && "opacity-60")}>
            <pre className="aui-tool-fallback-args-value whitespace-pre-wrap">{argsText}</pre>
          </div>
          {!isCancelled && result !== undefined && (
            <div className="aui-tool-fallback-result-root border-t border-dashed px-4 pt-2">
              <p className="aui-tool-fallback-result-header font-semibold">Result:</p>
              <pre className="aui-tool-fallback-result-content whitespace-pre-wrap">
                {safeStringifyPretty(result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ToolFallback: ToolCallMessagePartComponent = ToolFallbackImpl;
