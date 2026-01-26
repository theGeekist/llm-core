import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { TransportEvent } from "@geekist/llm-core/adapters/ai-sdk-ui";
import type { AdapterSource, ProviderId } from "../demo-options";
import { readAvailableProviders } from "../demo-options";
import { readProviderToken, writeProviderToken, clearProviderToken } from "../token-store";
import { bindFirst } from "@geekist/llm-core";
import type { OutcomeSummary, TransportData } from "./types";

const applyTokenChange = (
  setter: Dispatch<SetStateAction<string>>,
  event: ChangeEvent<HTMLInputElement>,
) => {
  setter(event.currentTarget.value);
  return true;
};

export const bindTokenChange = (setter: Dispatch<SetStateAction<string>>) =>
  bindFirst(applyTokenChange, setter);

type TransportDataUpdate = Omit<TransportData, "modelId"> & { modelId?: string | null };

const readOptionalModelId = (value: string | null | undefined) => value ?? undefined;

const applyTransportDataUpdate = (
  input: { transportData: TransportData },
  next: TransportDataUpdate,
) => {
  input.transportData.adapterSource = next.adapterSource;
  input.transportData.providerId = next.providerId;
  input.transportData.modelId = readOptionalModelId(next.modelId);
  return true;
};

const updateTransportData = (input: { transportData: TransportData }, next: TransportDataUpdate) =>
  applyTransportDataUpdate(input, next);

const readNextProviderId = (source: AdapterSource, providerId: ProviderId): ProviderId => {
  const providers = readAvailableProviders(source);
  const match = providers.find((entry) => entry.id === providerId) ?? providers[0];
  return match?.id ?? providerId;
};

const normalizeModelId = (value: string) => (value === "" ? null : value);

const applySourceChange = (
  input: {
    transportData: TransportData;
    adapterSource: AdapterSource;
    providerId: ProviderId;
    modelId: string | null;
    setAdapterSource: Dispatch<SetStateAction<AdapterSource>>;
    setProviderId: Dispatch<SetStateAction<ProviderId>>;
    setModelId: Dispatch<SetStateAction<string | null>>;
  },
  event: ChangeEvent<HTMLSelectElement>,
) => {
  const nextSource = event.currentTarget.value as AdapterSource;
  const nextProvider = readNextProviderId(nextSource, input.providerId);
  input.setAdapterSource(nextSource);
  input.setProviderId(nextProvider);
  input.setModelId(null);
  updateTransportData(input, {
    adapterSource: nextSource,
    providerId: nextProvider,
    modelId: null,
  });
  return true;
};

export const bindSourceChange = (input: {
  transportData: TransportData;
  adapterSource: AdapterSource;
  providerId: ProviderId;
  modelId: string | null;
  setAdapterSource: Dispatch<SetStateAction<AdapterSource>>;
  setProviderId: Dispatch<SetStateAction<ProviderId>>;
  setModelId: Dispatch<SetStateAction<string | null>>;
}) => bindFirst(applySourceChange, input);

const applyProviderChange = (
  input: {
    transportData: TransportData;
    adapterSource: AdapterSource;
    modelId: string | null;
    connectOpen: boolean;
    setProviderId: Dispatch<SetStateAction<ProviderId>>;
    setModelId: Dispatch<SetStateAction<string | null>>;
    setTokenDraft: Dispatch<SetStateAction<string>>;
  },
  event: ChangeEvent<HTMLSelectElement>,
) => {
  const nextProvider = event.currentTarget.value as ProviderId;
  input.setProviderId(nextProvider);
  input.setModelId(null);
  if (input.connectOpen) {
    input.setTokenDraft(readProviderToken(nextProvider) ?? "");
  }
  updateTransportData(input, {
    adapterSource: input.transportData.adapterSource,
    providerId: nextProvider,
    modelId: null,
  });
  return true;
};

export const bindProviderChange = (input: {
  transportData: TransportData;
  adapterSource: AdapterSource;
  modelId: string | null;
  connectOpen: boolean;
  setProviderId: Dispatch<SetStateAction<ProviderId>>;
  setModelId: Dispatch<SetStateAction<string | null>>;
  setTokenDraft: Dispatch<SetStateAction<string>>;
}) => bindFirst(applyProviderChange, input);

const applyModelChange = (
  input: {
    transportData: TransportData;
    adapterSource: AdapterSource;
    providerId: ProviderId;
    setModelId: Dispatch<SetStateAction<string | null>>;
  },
  event: ChangeEvent<HTMLSelectElement>,
) => {
  const nextModel = normalizeModelId(event.currentTarget.value);
  input.setModelId(nextModel);
  updateTransportData(input, {
    adapterSource: input.adapterSource,
    providerId: input.providerId,
    modelId: nextModel,
  });
  return true;
};

export const bindModelChange = (input: {
  transportData: TransportData;
  adapterSource: AdapterSource;
  providerId: ProviderId;
  setModelId: Dispatch<SetStateAction<string | null>>;
}) => bindFirst(applyModelChange, input);

const applyModelIdChange = (
  input: {
    transportData: TransportData;
    adapterSource: AdapterSource;
    providerId: ProviderId;
    setModelId: Dispatch<SetStateAction<string | null>>;
  },
  modelId: string | null,
) => {
  const normalized = modelId === "" ? null : modelId;
  input.setModelId(normalized);
  updateTransportData(input, {
    adapterSource: input.adapterSource,
    providerId: input.providerId,
    modelId: normalized,
  });
  return true;
};

export const bindModelIdChange = (input: {
  transportData: TransportData;
  adapterSource: AdapterSource;
  providerId: ProviderId;
  setModelId: Dispatch<SetStateAction<string | null>>;
}) => bindFirst(applyModelIdChange, input);

const applyConnectOpenChange = (
  input: {
    providerId: ProviderId;
    setConnectOpen: Dispatch<SetStateAction<boolean>>;
    setTokenDraft: Dispatch<SetStateAction<string>>;
  },
  nextOpen: boolean,
) => {
  input.setConnectOpen(nextOpen);
  if (nextOpen) {
    input.setTokenDraft(readProviderToken(input.providerId) ?? "");
  }
  return true;
};

export const bindConnectOpenChange = (input: {
  providerId: ProviderId;
  setConnectOpen: Dispatch<SetStateAction<boolean>>;
  setTokenDraft: Dispatch<SetStateAction<string>>;
}) => bindFirst(applyConnectOpenChange, input);

const applySaveToken = (input: {
  providerId: ProviderId;
  token: string;
  setTokenDraft: Dispatch<SetStateAction<string>>;
  setConnectOpen: Dispatch<SetStateAction<boolean>>;
}) => {
  if (!input.token.trim()) {
    return null;
  }
  const stored = writeProviderToken(input.providerId, input.token.trim());
  if (!stored) {
    return false;
  }
  input.setTokenDraft("");
  input.setConnectOpen(false);
  return true;
};

export const bindSaveToken = (input: {
  providerId: ProviderId;
  token: string;
  setTokenDraft: Dispatch<SetStateAction<string>>;
  setConnectOpen: Dispatch<SetStateAction<boolean>>;
}) => bindFirst(applySaveToken, input);

const applyClearToken = (input: {
  providerId: ProviderId;
  setTokenDraft: Dispatch<SetStateAction<string>>;
  setConnectOpen: Dispatch<SetStateAction<boolean>>;
}) => {
  const cleared = clearProviderToken(input.providerId);
  if (!cleared) {
    return false;
  }
  input.setTokenDraft("");
  input.setConnectOpen(false);
  return true;
};

export const bindClearToken = (input: {
  providerId: ProviderId;
  setTokenDraft: Dispatch<SetStateAction<string>>;
  setConnectOpen: Dispatch<SetStateAction<boolean>>;
}) => bindFirst(applyClearToken, input);

const applyTransportEvent = (
  input: {
    setEvents: Dispatch<SetStateAction<TransportEvent[]>>;
    setOutcome: Dispatch<SetStateAction<OutcomeSummary | null>>;
  },
  event: TransportEvent,
) => {
  input.setEvents(bindFirst(applyAppendEvent, event));
  const outcome = readOutcomeFromEvent(event);
  if (outcome) {
    input.setOutcome(outcome);
  }
  return true;
};

export const bindHandleTransportEvent = (input: {
  setEvents: Dispatch<SetStateAction<TransportEvent[]>>;
  setOutcome: Dispatch<SetStateAction<OutcomeSummary | null>>;
}) => bindFirst(applyTransportEvent, input);

const applyAppendEvent = (event: TransportEvent, events: TransportEvent[]) =>
  appendEvent(events, event);

export const appendEvent = (events: TransportEvent[], event: TransportEvent) => {
  const next = events.concat(event);
  if (next.length <= 40) {
    return next;
  }
  return next.slice(next.length - 40);
};

export const readOutcomeFromEvent = (event: TransportEvent): OutcomeSummary | null => {
  if (event.direction !== "incoming") {
    return null;
  }
  if (event.message.type !== "ui.done") {
    return null;
  }
  return {
    status: event.message.status ?? "ok",
    token: event.message.token ?? null,
  };
};

type UiChunkMessage = Extract<TransportEvent["message"], { type: "ui.chunk" }>;
type UiChunk = UiChunkMessage["chunk"];

const readUiChunkType = (chunk: UiChunk) => chunk.type;

const isUiChunk = (message: TransportEvent["message"]): message is UiChunkMessage =>
  message.type === "ui.chunk";

const isDataChunk = (chunk: UiChunk) => readUiChunkType(chunk).startsWith("data-");

const readArrayLength = (value: unknown) => (Array.isArray(value) ? value.length : 0);

const readChunkData = (chunk: UiChunk): unknown | null => {
  if (!chunk || typeof chunk !== "object") {
    return null;
  }
  if ("data" in chunk) {
    return (chunk as { data?: unknown }).data ?? null;
  }
  return null;
};

const readDiagnosticSummary = (data: unknown) => {
  if (Array.isArray(data)) {
    return `(${data.length})`;
  }
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return `(${message})`;
    }
  }
  return "";
};

const readSourcesSummary = (data: unknown) => {
  const count = readArrayLength(data);
  return count > 0 ? `(${count})` : "";
};

const formatDataChunk = (chunk: UiChunk) => {
  const chunkType = readUiChunkType(chunk);
  if (chunkType === "data-diagnostic") {
    return `${chunkType}${readDiagnosticSummary(readChunkData(chunk))}`;
  }
  if (chunkType === "data-sources") {
    return `${chunkType}${readSourcesSummary(readChunkData(chunk))}`;
  }
  return chunkType;
};

const formatUiChunk = (chunk: UiChunk) => {
  if (isDataChunk(chunk)) {
    return `ui.chunk: ${formatDataChunk(chunk)}`;
  }
  return `ui.chunk: ${readUiChunkType(chunk)}`;
};

export const formatTransportEvent = (event: TransportEvent) => {
  const label = event.message.type;
  if (label === "ui.chunk") {
    if (isUiChunk(event.message)) {
      return formatUiChunk(event.message.chunk);
    }
    return "ui.chunk";
  }
  if (label === "ui.error") {
    return `ui.error: ${event.message.error}`;
  }
  if (label === "ui.done") {
    return `ui.done: ${event.message.status ?? "ok"}`;
  }
  if (label === "chat.send") {
    return `chat.send (${event.message.messages.length} messages)`;
  }
  if (label === "auth.set") {
    return `auth.set (${event.message.providerId})`;
  }
  return `unknown: ${label}`;
};
