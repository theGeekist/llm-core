import type {
  AdapterMessageContent,
  AdapterMessagePart,
  AdapterRetrievalQuery,
  AdapterStructuredContent,
} from "./types";

const getTextParts = (parts: AdapterMessagePart[]) =>
  parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");

const toStructuredText = (content: AdapterStructuredContent) => {
  if (content.text) {
    return content.text;
  }
  const fallback = getTextParts(content.parts);
  return fallback || "";
};

const toContentText = (content: AdapterMessageContent) =>
  typeof content === "string" ? content : toStructuredText(content);

export const toQueryText = (query: AdapterRetrievalQuery) =>
  typeof query === "string" ? query : toContentText(query);
