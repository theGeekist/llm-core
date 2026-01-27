import type { MessageContent, MessagePart, RetrievalQuery, StructuredContent } from "./types";

const getTextParts = (parts: MessagePart[]) =>
  parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");

const toStructuredText = (content: StructuredContent) => {
  if (content.text) {
    return content.text;
  }
  const fallback = getTextParts(content.parts);
  return fallback || "";
};

const toContentText = (content: MessageContent) =>
  typeof content === "string" ? content : toStructuredText(content);

export const toQueryText = (query: RetrievalQuery) =>
  typeof query === "string" ? query : toContentText(query);
