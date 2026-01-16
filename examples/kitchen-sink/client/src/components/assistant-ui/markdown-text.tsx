"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import {
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { memo, type ComponentProps } from "react";

import { cn } from "../../lib/utils";

const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md"
      components={defaultComponents}
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

const InlineCode = ({ className, ...props }: ComponentProps<"code">) => {
  const isCodeBlock = useIsMarkdownCodeBlock();
  return (
    <code
      className={cn(
        !isCodeBlock && "aui-md-inline-code rounded border bg-muted font-semibold",
        className,
      )}
      {...props}
    />
  );
};

const defaultComponents = memoizeMarkdownComponents({
  p: ({ className, ...props }) => (
    <p className={cn("aui-md-p mt-5 mb-5 leading-7 first:mt-0 last:mb-0", className)} {...props} />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn("aui-md-a font-medium text-primary underline underline-offset-4", className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn("aui-md-pre overflow-x-auto rounded-b-lg bg-black p-4 text-white", className)}
      {...props}
    />
  ),
  code: InlineCode,
});
