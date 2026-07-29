import type { PromptTemplate as LlamaIndexPromptTemplate } from "@llamaindex/core/prompts";
import { preparePromptTemplate, type PromptTemplate } from "../../../../features/model/public";

interface LlamaIndexPromptMetadata {
  readonly promptType?: string;
  readonly metadata?: unknown;
}

const sanitize = (value: unknown): null | boolean | number | string | object => {
  if (typeof value === "string") {
    return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? "[redacted-url]" : value;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        /^(?:credential|local[-_]?path|password|path|secret|signed[-_]?url|skill[-_]?path|token)$/i.test(
          key,
        )
          ? "[redacted]"
          : sanitize(child),
      ]),
    );
  }
  return null;
};

export interface LlamaIndexPromptInput {
  readonly prompt: LlamaIndexPromptTemplate;
  readonly name?: string;
}

export const fromLlamaIndexPromptTemplate = ({
  prompt,
  name,
}: LlamaIndexPromptInput): PromptTemplate => {
  const native = prompt as LlamaIndexPromptTemplate & LlamaIndexPromptMetadata;
  if (typeof native.template !== "string") {
    throw new TypeError("LlamaIndex prompt templates require a string template.");
  }
  return preparePromptTemplate({
    name: name ?? native.promptType ?? "llamaindex.prompt",
    template: native.template,
    inputs: native.vars().map((variable) => ({
      name: variable,
      type: "string",
      required: true,
    })),
    ...(native.metadata === undefined
      ? {}
      : {
          metadata: {
            "org.llamaindex": sanitize(native.metadata) as never,
          },
        }),
  });
};
