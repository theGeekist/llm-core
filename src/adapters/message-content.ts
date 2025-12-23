import type {
  DataPart,
  FilePart,
  ImagePart,
  MessageContent,
  MessagePart,
  StructuredContent,
  TextPart,
} from "./types";

type PartWithType = { type?: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStructuredContent = (value: unknown): value is StructuredContent =>
  isObject(value) && Array.isArray(value.parts) && typeof value.text === "string";

const toDataPart = (data: unknown): DataPart => ({
  type: "data",
  data,
});

const getTextParts = (parts: MessagePart[]) =>
  parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("");

const toImagePartFromUrl = (url: string): ImagePart => ({ type: "image", url });

const toImagePartFromData = (data: string, mediaType?: string): ImagePart => ({
  type: "image",
  data,
  mediaType,
});

const toFilePartFromData = (data: string, mediaType?: string): FilePart => ({
  type: "file",
  data,
  mediaType,
});

const readMediaType = (part: Record<string, unknown>) => {
  if (typeof part.mediaType === "string") {
    return part.mediaType;
  }
  if (typeof part.mimeType === "string") {
    return part.mimeType;
  }
  return undefined;
};

const toImagePart = (value: unknown, mediaType?: string): MessagePart => {
  if (value instanceof URL) {
    return toImagePartFromUrl(String(value));
  }
  if (typeof value === "string") {
    if (value.startsWith("data:")) {
      return toImagePartFromData(value, mediaType);
    }
    return toImagePartFromUrl(value);
  }
  if (value instanceof Uint8Array) {
    return toImagePartFromData(encodeBase64(value), mediaType);
  }
  if (value instanceof ArrayBuffer) {
    return toImagePartFromData(encodeBase64(new Uint8Array(value)), mediaType);
  }
  if (typeof Buffer !== "undefined" && value instanceof Buffer) {
    return toImagePartFromData(encodeBase64(new Uint8Array(value)), mediaType);
  }
  return toDataPart(value);
};

const toFilePart = (value: unknown, mediaType?: string): MessagePart => {
  if (value instanceof URL) {
    return toFilePartFromData(String(value), mediaType);
  }
  if (typeof value === "string") {
    return toFilePartFromData(value, mediaType);
  }
  if (value instanceof Uint8Array) {
    return toFilePartFromData(encodeBase64(value), mediaType);
  }
  if (value instanceof ArrayBuffer) {
    return toFilePartFromData(encodeBase64(new Uint8Array(value)), mediaType);
  }
  if (typeof Buffer !== "undefined" && value instanceof Buffer) {
    return toFilePartFromData(encodeBase64(new Uint8Array(value)), mediaType);
  }
  return toDataPart(value);
};

const readType = (part: PartWithType) => (typeof part.type === "string" ? part.type : "");

const toTextPart = (part: Record<string, unknown>): MessagePart | undefined => {
  if (readType(part) === "text" && typeof part.text === "string") {
    return { type: "text", text: part.text };
  }
  return undefined;
};

const toReasoningPart = (part: Record<string, unknown>): MessagePart | undefined => {
  if (readType(part) === "reasoning" && typeof part.text === "string") {
    return { type: "reasoning", text: part.text };
  }
  return undefined;
};

const toToolCallPart = (part: Record<string, unknown>): MessagePart | undefined => {
  if (readType(part) === "tool-call" && typeof part.toolName === "string") {
    return {
      type: "tool-call",
      toolCallId: typeof part.toolCallId === "string" ? part.toolCallId : undefined,
      toolName: part.toolName,
      input: part.input,
    };
  }
  return undefined;
};

const toToolResultPart = (part: Record<string, unknown>): MessagePart | undefined => {
  if (readType(part) === "tool-result" && typeof part.toolName === "string") {
    return {
      type: "tool-result",
      toolCallId: typeof part.toolCallId === "string" ? part.toolCallId : undefined,
      toolName: part.toolName,
      output: part.output,
    };
  }
  return undefined;
};

const toImagePartFromObject = (part: Record<string, unknown>): MessagePart | undefined => {
  if (readType(part) === "image") {
    return toImagePart(part.image, readMediaType(part));
  }
  if (readType(part) === "image_url" && isObject(part.image_url)) {
    const url = part.image_url.url;
    if (typeof url === "string") {
      return toImagePartFromUrl(url);
    }
  }
  return undefined;
};

const toFilePartFromObject = (part: Record<string, unknown>): MessagePart | undefined => {
  if (readType(part) === "file") {
    return toFilePart(part.data, readMediaType(part));
  }
  return undefined;
};

const partParsers = [
  toTextPart,
  toReasoningPart,
  toToolCallPart,
  toToolResultPart,
  toImagePartFromObject,
  toFilePartFromObject,
];

const parseAdapterPart = (value: unknown): MessagePart | undefined => {
  if (!isObject(value)) {
    return undefined;
  }
  for (const parser of partParsers) {
    const parsed = parser(value);
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
};

const toAdapterPart = (value: unknown): MessagePart => parseAdapterPart(value) ?? toDataPart(value);

export function toMessageContent(input: unknown): MessageContent {
  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    const parts = input.map(toAdapterPart);
    const structured: StructuredContent = {
      text: getTextParts(parts),
      parts,
    };
    return structured;
  }

  if (isStructuredContent(input)) {
    return input;
  }

  if (isObject(input)) {
    const parsed = parseAdapterPart(input);
    if (parsed) {
      return {
        text: getTextParts([parsed]),
        parts: [parsed],
        raw: input,
      };
    }
  }

  if (isObject(input) && typeof input.text === "string" && !Array.isArray(input.parts)) {
    return input.text;
  }

  return {
    text: "",
    parts: [toDataPart(input)],
    raw: input,
  };
}

const encodeBase64 = (data: Uint8Array) => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};
