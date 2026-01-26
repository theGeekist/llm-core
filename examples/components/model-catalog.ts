import { bindFirst } from "@geekist/llm-core";
import type { ProviderId } from "@geekist/llm-core/adapters";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";

export type ModelOption = {
  id: string;
  label: string;
};

export type ModelCatalogState = {
  status: "idle" | "loading" | "ready" | "error";
  models: ModelOption[];
  error: string | null;
};

export type ModelCatalogRequest = {
  providerId: ProviderId;
  token?: string | null;
};

type ModelCatalogResponse = {
  providerId: ProviderId;
  models: ModelOption[];
  error?: string;
};

type ModelCatalogInput = {
  providerId: ProviderId;
  token: string | null;
  endpoint?: string;
  fallbackModels: ModelOption[];
  fallbackKey: string;
};

type ModelCatalogEffectInput = ModelCatalogInput & {
  setState: Dispatch<SetStateAction<ModelCatalogState>>;
};

type ModelSelectionInput = {
  modelId: string | null;
  models: ModelOption[];
  setModelId: Dispatch<SetStateAction<string | null>>;
  onModelIdChange: (modelId: string | null) => boolean;
};

const createModelCatalogState = (models: ModelOption[]): ModelCatalogState => ({
  status: "idle",
  models,
  error: null,
});

const applyModelCatalogFallback = (
  state: ModelCatalogState,
  fallbackModels: ModelOption[],
): ModelCatalogState => ({
  ...state,
  status: "idle",
  models: fallbackModels,
  error: null,
});

const applyModelCatalogFallbackInput = (
  models: ModelOption[],
  state: ModelCatalogState,
): ModelCatalogState => applyModelCatalogFallback(state, models);

const applyModelCatalogLoading = (state: ModelCatalogState): ModelCatalogState => ({
  ...state,
  status: "loading",
  error: null,
});

const applyModelCatalogReady = (
  state: ModelCatalogState,
  models: ModelOption[],
): ModelCatalogState => ({
  ...state,
  status: "ready",
  models,
  error: null,
});

const applyModelCatalogReadyInput = (
  models: ModelOption[],
  state: ModelCatalogState,
): ModelCatalogState => applyModelCatalogReady(state, models);

const applyModelCatalogError = (
  state: ModelCatalogState,
  error: string,
  fallbackModels: ModelOption[],
): ModelCatalogState => ({
  ...state,
  status: "error",
  models: fallbackModels,
  error,
});

type ModelCatalogErrorInput = {
  error: string;
  fallback: ModelOption[];
};

const applyModelCatalogErrorInput = (
  input: ModelCatalogErrorInput,
  state: ModelCatalogState,
): ModelCatalogState => applyModelCatalogError(state, input.error, input.fallback);

const hasString = (value: unknown): value is string => typeof value === "string";

const toModelOption = (value: unknown): ModelOption | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { id?: unknown; label?: unknown };
  if (!hasString(record.id) || !hasString(record.label)) {
    return null;
  }
  return { id: record.id, label: record.label };
};

const readModelOptions = (value: unknown): ModelOption[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const mapped: ModelOption[] = [];
  for (const entry of value) {
    const option = toModelOption(entry);
    if (option) {
      mapped.push(option);
    }
  }
  return mapped;
};

const isProviderId = (value: unknown): value is ProviderId =>
  value === "openai" || value === "anthropic" || value === "ollama";

const parseModelCatalogResponse = (value: unknown): ModelCatalogResponse | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { providerId?: unknown; models?: unknown; error?: unknown };
  if (!isProviderId(record.providerId)) {
    return null;
  }
  const models = readModelOptions(record.models);
  const error = hasString(record.error) ? record.error : undefined;
  return { providerId: record.providerId, models, error };
};

const createModelCatalogRequest = (input: ModelCatalogRequest) => ({
  providerId: input.providerId,
  token: input.token ?? null,
});

const readEndpoint = (endpoint?: string) => endpoint ?? "/models";

const fetchModelCatalog = async (input: {
  endpoint?: string;
  providerId: ProviderId;
  token: string | null;
  signal: AbortSignal;
}): Promise<ModelCatalogResponse> => {
  const response = await fetch(readEndpoint(input.endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      createModelCatalogRequest({ providerId: input.providerId, token: input.token }),
    ),
    signal: input.signal,
  });
  if (!response.ok) {
    return {
      providerId: input.providerId,
      models: [],
      error: `Model catalog request failed (${response.status}).`,
    };
  }
  const payload = (await response.json()) as unknown;
  return (
    parseModelCatalogResponse(payload) ?? {
      providerId: input.providerId,
      models: [],
      error: "Invalid model catalog response.",
    }
  );
};

const setCatalogFallback = (
  setState: Dispatch<SetStateAction<ModelCatalogState>>,
  models: ModelOption[],
) => {
  setState(bindFirst(applyModelCatalogFallbackInput, models));
  return true;
};

const setCatalogLoading = (setState: Dispatch<SetStateAction<ModelCatalogState>>) => {
  setState(applyModelCatalogLoading);
  return true;
};

const setCatalogReady = (input: {
  setState: Dispatch<SetStateAction<ModelCatalogState>>;
  models: ModelOption[];
}) => {
  input.setState(bindFirst(applyModelCatalogReadyInput, input.models));
  return true;
};

const setCatalogError = (input: {
  setState: Dispatch<SetStateAction<ModelCatalogState>>;
  error: string;
  fallback: ModelOption[];
}) => {
  input.setState(
    bindFirst(applyModelCatalogErrorInput, { error: input.error, fallback: input.fallback }),
  );
  return true;
};

const createAbortController = () => new AbortController();

const abortController = (controller: AbortController) => {
  controller.abort();
  return undefined;
};

const readErrorName = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return null;
  }
  const record = error as { name?: unknown };
  return typeof record.name === "string" ? record.name : null;
};

const readErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const isAbortError = (error: unknown) => readErrorName(error) === "AbortError";

const requestModelCatalog = async (input: {
  providerId: ProviderId;
  token: string | null;
  endpoint?: string;
  fallbackModels: ModelOption[];
  setState: Dispatch<SetStateAction<ModelCatalogState>>;
  signal: AbortSignal;
}): Promise<boolean> => {
  setCatalogLoading(input.setState);
  try {
    const response = await fetchModelCatalog({
      endpoint: input.endpoint,
      providerId: input.providerId,
      token: input.token,
      signal: input.signal,
    });
    if (response.error) {
      setCatalogError({
        setState: input.setState,
        error: response.error,
        fallback: input.fallbackModels,
      });
      return false;
    }
    setCatalogReady({ setState: input.setState, models: response.models });
    return true;
  } catch (error) {
    if (isAbortError(error)) {
      return false;
    }
    setCatalogError({
      setState: input.setState,
      error: readErrorMessage(error),
      fallback: input.fallbackModels,
    });
    return false;
  }
};

const runModelCatalogEffect = (input: ModelCatalogEffectInput) => {
  const controller = createAbortController();
  setCatalogFallback(input.setState, input.fallbackModels);
  void requestModelCatalog({
    providerId: input.providerId,
    token: input.token,
    endpoint: input.endpoint,
    fallbackModels: input.fallbackModels,
    setState: input.setState,
    signal: controller.signal,
  });
  return bindFirst(abortController, controller);
};

export const useModelCatalog = (input: ModelCatalogInput): ModelCatalogState => {
  const [state, setState] = useState(createModelCatalogState(input.fallbackModels));
  useEffect(
    bindFirst(runModelCatalogEffect, {
      ...input,
      setState,
    }),
    [input.providerId, input.token, input.endpoint, input.fallbackKey],
  );
  return state;
};

const hasModelId = (input: { modelId: string; models: ModelOption[] }) => {
  for (const model of input.models) {
    if (model.id === input.modelId) {
      return true;
    }
  }
  return false;
};

const readModelId = (input: { modelId: string | null; models: ModelOption[] }) => {
  if (!input.modelId) {
    return input.models[0]?.id ?? null;
  }
  const exists = hasModelId({ modelId: input.modelId, models: input.models });
  return exists ? input.modelId : (input.models[0]?.id ?? null);
};

const applyModelSelection = (input: ModelSelectionInput) => {
  const nextModelId = readModelId({ modelId: input.modelId, models: input.models });
  if (nextModelId === input.modelId) {
    return null;
  }
  input.setModelId(nextModelId);
  input.onModelIdChange(nextModelId);
  return true;
};

const runModelSelectionEffect = (input: ModelSelectionInput) => {
  applyModelSelection(input);
  return undefined;
};

export const useModelSelection = (input: ModelSelectionInput) => {
  useEffect(bindFirst(runModelSelectionEffect, input), [input.modelId, input.models]);
  return input;
};

type ModelEntry = {
  id: string;
  label: string;
};

const isString = (value: unknown): value is string => typeof value === "string";

const normalizeLabel = (value: string) => value.replace(/[-_]/g, " ").trim();

const buildModelEntry = (id: string, label?: string): ModelEntry => ({
  id,
  label: label ? label : normalizeLabel(id),
});

const compareModels = (left: ModelEntry, right: ModelEntry) =>
  left.label.localeCompare(right.label);

const sortModels = (models: ModelEntry[]) => {
  const next = models.slice();
  next.sort(compareModels);
  return next;
};

const toModelOptions = (models: ModelEntry[]): ModelOption[] => {
  const sorted = sortModels(models);
  const options: ModelOption[] = [];
  for (const entry of sorted) {
    options.push({ id: entry.id, label: entry.label });
  }
  return options;
};

const readRequestBody = async (req: Request): Promise<ModelCatalogRequest | null> => {
  try {
    const body = (await req.json()) as Partial<ModelCatalogRequest>;
    if (!body || !isProviderId(body.providerId)) {
      return null;
    }
    return {
      providerId: body.providerId,
      token: body.token ?? null,
    };
  } catch {
    return null;
  }
};

const withAuthHeader = (token: string, headers: HeadersInit) => ({
  ...headers,
  Authorization: `Bearer ${token}`,
});

const MODEL_CATALOG_TIMEOUT_MS = 8000;

const abortControllerAbort = (controller: AbortController) => {
  controller.abort();
  return true;
};

const startAbortTimer = (controller: AbortController, timeoutMs: number) =>
  setTimeout(bindFirst(abortControllerAbort, controller), timeoutMs);

const clearAbortTimer = (timerId: ReturnType<typeof setTimeout>) => {
  clearTimeout(timerId);
  return true;
};

const createTimeoutSignal = (timeoutMs: number) => {
  const controller = new AbortController();
  const timerId = startAbortTimer(controller, timeoutMs);
  return { signal: controller.signal, timerId };
};

const fetchOpenAiModels = async (token: string, signal?: AbortSignal): Promise<ModelEntry[]> => {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: withAuthHeader(token, {}),
    signal,
  });
  if (!response.ok) {
    throw new Error(`OpenAI models error (${response.status}).`);
  }
  const payload = (await response.json()) as { data?: Array<{ id?: string }> };
  const data = Array.isArray(payload.data) ? payload.data : [];
  const entries: ModelEntry[] = [];
  for (const item of data) {
    if (item?.id && isString(item.id)) {
      entries.push(buildModelEntry(item.id));
    }
  }
  return entries;
};

const fetchAnthropicModels = async (token: string, signal?: AbortSignal): Promise<ModelEntry[]> => {
  const response = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": token,
      "anthropic-version": "2023-06-01",
    },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Anthropic models error (${response.status}).`);
  }
  const payload = (await response.json()) as {
    data?: Array<{ id?: string; display_name?: string }>;
  };
  const data = Array.isArray(payload.data) ? payload.data : [];
  const entries: ModelEntry[] = [];
  for (const item of data) {
    if (item?.id && isString(item.id)) {
      entries.push(buildModelEntry(item.id, item.display_name));
    }
  }
  return entries;
};

const fetchOllamaModels = async (signal?: AbortSignal): Promise<ModelEntry[]> => {
  const response = await fetch("http://127.0.0.1:11434/api/tags", { signal });
  if (!response.ok) {
    throw new Error(`Ollama models error (${response.status}).`);
  }
  const payload = (await response.json()) as { models?: Array<{ name?: string }> };
  const data = Array.isArray(payload.models) ? payload.models : [];
  const entries: ModelEntry[] = [];
  for (const item of data) {
    if (item?.name && isString(item.name)) {
      entries.push(buildModelEntry(item.name));
    }
  }
  return entries;
};

const fetchProviderModels = async (input: ModelCatalogRequest): Promise<ModelOption[]> => {
  const timeout = createTimeoutSignal(MODEL_CATALOG_TIMEOUT_MS);
  try {
    if (input.providerId === "ollama") {
      return toModelOptions(await fetchOllamaModels(timeout.signal));
    }
    if (!input.token) {
      throw new Error(`Missing API token for ${input.providerId}.`);
    }
    if (input.providerId === "openai") {
      return toModelOptions(await fetchOpenAiModels(input.token, timeout.signal));
    }
    if (input.providerId === "anthropic") {
      return toModelOptions(await fetchAnthropicModels(input.token, timeout.signal));
    }
    throw new Error(`Unsupported provider ${input.providerId}.`);
  } finally {
    clearAbortTimer(timeout.timerId);
  }
};

const buildModelResponse = (input: ModelCatalogResponse) =>
  new Response(JSON.stringify(input), {
    headers: { "Content-Type": "application/json" },
  });

export const handleModelCatalogRequest = async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const request = await readRequestBody(req);
  if (!request) {
    return new Response("Invalid model request", { status: 400 });
  }
  try {
    const models = await fetchProviderModels(request);
    return buildModelResponse({ providerId: request.providerId, models });
  } catch (error) {
    return buildModelResponse({
      providerId: request.providerId,
      models: [],
      error: error instanceof Error ? error.message : "Unknown model error.",
    });
  }
};
