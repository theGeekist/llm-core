import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { TransportEvent, WebSocketChatData } from "../../../../../src/adapters";
import type { AdapterSource, ProviderId, RecipeId } from "../demo-options";
import { readAvailableModels, readAvailableProviders, readDefaultModel } from "../demo-options";
import { readProviderToken, writeProviderToken, clearProviderToken } from "../token-store";
import { bindFirst } from "../../../../../src/shared/fp";

export type TransportData = WebSocketChatData & {
  recipeId: RecipeId;
  adapterSource: AdapterSource;
  providerId: ProviderId;
  modelId: string;
};

export type OutcomeSummary = {
  status: string;
  token: string | null;
};

const applySelectChange = <T extends string>(
  setter: Dispatch<SetStateAction<T>>,
  event: ChangeEvent<HTMLSelectElement>,
) => {
  setter(event.currentTarget.value as T);
  return true;
};

export const bindSelectChange = <T extends string>(setter: Dispatch<SetStateAction<T>>) =>
  bindFirst(applySelectChange, setter);

const applyTokenChange = (
  setter: Dispatch<SetStateAction<string>>,
  event: ChangeEvent<HTMLInputElement>,
) => {
  setter(event.currentTarget.value);
  return true;
};

export const bindTokenChange = (setter: Dispatch<SetStateAction<string>>) =>
  bindFirst(applyTokenChange, setter);

const toggleBoolean = (value: boolean) => !value;

const applyToggle = (setter: Dispatch<SetStateAction<boolean>>) => {
  setter(toggleBoolean);
  return true;
};

export const bindToggle = (setter: Dispatch<SetStateAction<boolean>>) =>
  bindFirst(applyToggle, setter);

const applyTransportDataUpdate = (input: { transportData: TransportData }, next: TransportData) => {
  input.transportData.recipeId = next.recipeId;
  input.transportData.adapterSource = next.adapterSource;
  input.transportData.providerId = next.providerId;
  input.transportData.modelId = next.modelId;
  return true;
};

const updateTransportData = (input: { transportData: TransportData }, next: TransportData) =>
  applyTransportDataUpdate(input, next);

const readNextProviderId = (source: AdapterSource, providerId: ProviderId): ProviderId => {
  const providers = readAvailableProviders(source);
  const match = providers.find((entry) => entry.id === providerId) ?? providers[0];
  return match?.id ?? providerId;
};

const readNextModelId = (source: AdapterSource, providerId: ProviderId, modelId: string) => {
  const models = readAvailableModels(source, providerId);
  const match = models.find((entry) => entry.id === modelId);
  if (match) {
    return match.id;
  }
  return readDefaultModel(source, providerId);
};

const applyRecipeChange = (
  input: {
    transportData: TransportData;
    adapterSource: AdapterSource;
    providerId: ProviderId;
    modelId: string;
    setRecipeId: Dispatch<SetStateAction<RecipeId>>;
  },
  event: ChangeEvent<HTMLSelectElement>,
) => {
  const recipeId = event.currentTarget.value as RecipeId;
  input.setRecipeId(recipeId);
  updateTransportData(input, {
    recipeId,
    adapterSource: input.adapterSource,
    providerId: input.providerId,
    modelId: input.modelId,
  });
  return true;
};

export const bindRecipeChange = (input: {
  transportData: TransportData;
  adapterSource: AdapterSource;
  providerId: ProviderId;
  modelId: string;
  setRecipeId: Dispatch<SetStateAction<RecipeId>>;
}) => bindFirst(applyRecipeChange, input);

const applySourceChange = (
  input: {
    transportData: TransportData;
    adapterSource: AdapterSource;
    providerId: ProviderId;
    modelId: string;
    setAdapterSource: Dispatch<SetStateAction<AdapterSource>>;
    setProviderId: Dispatch<SetStateAction<ProviderId>>;
    setModelId: Dispatch<SetStateAction<string>>;
  },
  event: ChangeEvent<HTMLSelectElement>,
) => {
  const nextSource = event.currentTarget.value as AdapterSource;
  const nextProvider = readNextProviderId(nextSource, input.providerId);
  const nextModel = readNextModelId(nextSource, nextProvider, input.modelId);
  input.setAdapterSource(nextSource);
  input.setProviderId(nextProvider);
  input.setModelId(nextModel);
  updateTransportData(input, {
    recipeId: input.transportData.recipeId,
    adapterSource: nextSource,
    providerId: nextProvider,
    modelId: nextModel,
  });
  return true;
};

export const bindSourceChange = (input: {
  transportData: TransportData;
  adapterSource: AdapterSource;
  providerId: ProviderId;
  modelId: string;
  setAdapterSource: Dispatch<SetStateAction<AdapterSource>>;
  setProviderId: Dispatch<SetStateAction<ProviderId>>;
  setModelId: Dispatch<SetStateAction<string>>;
}) => bindFirst(applySourceChange, input);

const applyProviderChange = (
  input: {
    transportData: TransportData;
    adapterSource: AdapterSource;
    modelId: string;
    connectOpen: boolean;
    setProviderId: Dispatch<SetStateAction<ProviderId>>;
    setModelId: Dispatch<SetStateAction<string>>;
    setTokenDraft: Dispatch<SetStateAction<string>>;
  },
  event: ChangeEvent<HTMLSelectElement>,
) => {
  const nextProvider = event.currentTarget.value as ProviderId;
  const nextModel = readNextModelId(input.adapterSource, nextProvider, input.modelId);
  input.setProviderId(nextProvider);
  input.setModelId(nextModel);
  if (input.connectOpen) {
    input.setTokenDraft(readProviderToken(nextProvider) ?? "");
  }
  updateTransportData(input, {
    recipeId: input.transportData.recipeId,
    adapterSource: input.transportData.adapterSource,
    providerId: nextProvider,
    modelId: nextModel,
  });
  return true;
};

export const bindProviderChange = (input: {
  transportData: TransportData;
  adapterSource: AdapterSource;
  modelId: string;
  connectOpen: boolean;
  setProviderId: Dispatch<SetStateAction<ProviderId>>;
  setModelId: Dispatch<SetStateAction<string>>;
  setTokenDraft: Dispatch<SetStateAction<string>>;
}) => bindFirst(applyProviderChange, input);

const applyModelChange = (
  input: {
    transportData: TransportData;
    adapterSource: AdapterSource;
    providerId: ProviderId;
    setModelId: Dispatch<SetStateAction<string>>;
  },
  event: ChangeEvent<HTMLSelectElement>,
) => {
  const nextModel = event.currentTarget.value;
  input.setModelId(nextModel);
  updateTransportData(input, {
    recipeId: input.transportData.recipeId,
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
  setModelId: Dispatch<SetStateAction<string>>;
}) => bindFirst(applyModelChange, input);

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
  writeProviderToken(input.providerId, input.token.trim());
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
  clearProviderToken(input.providerId);
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

export const formatTransportEvent = (event: TransportEvent) => {
  const label = event.message.type;
  if (label === "ui.chunk") {
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
  return `auth.set (${event.message.providerId})`;
};
