import type { AdapterBundle, Document, EventStream, Model, Retriever } from "../types";
import { createBuiltinRetriever } from "./retriever";

export type BuiltinAdaptersInput = {
  model?: Model | null;
  retriever?: Retriever | null;
  documents?: Document[] | null;
  eventStream?: EventStream | null;
  trace?: EventStream | null;
};

const readRetriever = (input: BuiltinAdaptersInput): Retriever | null => {
  if (input.retriever) {
    return input.retriever;
  }
  if (input.documents) {
    return createBuiltinRetriever(input.documents);
  }
  return null;
};

export const createBuiltinAdapters = (input: BuiltinAdaptersInput): AdapterBundle => {
  const adapters: AdapterBundle = {};
  const retriever = readRetriever(input);
  if (input.model) {
    adapters.model = input.model;
  }
  if (retriever) {
    adapters.retriever = retriever;
  }
  if (input.eventStream) {
    adapters.eventStream = input.eventStream;
  }
  if (input.trace) {
    adapters.trace = input.trace;
  }
  return adapters;
};
