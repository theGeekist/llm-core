"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import {
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";

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

type MarkdownComponents = Parameters<typeof memoizeMarkdownComponents>[0];
type MarkdownParagraphRenderer = NonNullable<MarkdownComponents>["p"];
type MarkdownLinkRenderer = NonNullable<MarkdownComponents>["a"];
type MarkdownPreRenderer = NonNullable<MarkdownComponents>["pre"];
type MarkdownCodeRenderer = NonNullable<MarkdownComponents>["code"];

const readClassName = (props: { className?: string }) => props.className;

const InlineCode: MarkdownCodeRenderer = (props) => {
  const isCodeBlock = useIsMarkdownCodeBlock();
  const { className, ...rest } = props;
  return (
    <code
      {...rest}
      className={cn(
        !isCodeBlock && "aui-md-inline-code rounded border bg-muted font-semibold",
        className,
      )}
    />
  );
};

const renderMarkdownParagraph: MarkdownParagraphRenderer = (props) => {
  const { className, ...rest } = props;
  return (
    <p
      {...rest}
      className={cn(
        "aui-md-p mt-5 mb-5 leading-7 first:mt-0 last:mb-0",
        readClassName({ className }),
      )}
    />
  );
};

const renderMarkdownLink: MarkdownLinkRenderer = (props) => {
  const { className, ...rest } = props;
  return (
    <a
      {...rest}
      className={cn(
        "aui-md-a font-medium text-primary underline underline-offset-4",
        readClassName({ className }),
      )}
    />
  );
};

const renderMarkdownPre: MarkdownPreRenderer = (props) => {
  const { className, ...rest } = props;
  return (
    <pre
      {...rest}
      className={cn(
        "aui-md-pre overflow-x-auto rounded-b-lg bg-black p-4 text-white",
        readClassName({ className }),
      )}
    />
  );
};

const defaultComponents = memoizeMarkdownComponents({
  p: renderMarkdownParagraph,
  a: renderMarkdownLink,
  pre: renderMarkdownPre,
  code: InlineCode,
});
