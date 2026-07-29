import type { JsonObject } from "#contracts";
import type { MaybePromise } from "#shared/maybe";

export interface LlamaIndexKeyValueStore {
  get(key: string, collection?: string): MaybePromise<unknown>;
  put(key: string, value: unknown, collection?: string): MaybePromise<void>;
  delete(key: string, collection?: string): MaybePromise<boolean>;
}

export interface LlamaIndexDocument {
  toJSON(): unknown;
}

export interface LlamaIndexDocumentStore {
  docs(): MaybePromise<Record<string, unknown>>;
  getDocument(key: string, raiseError: boolean): MaybePromise<LlamaIndexDocument | undefined>;
  addDocuments(documents: JsonObject[], allowUpdate: boolean): MaybePromise<void>;
  deleteDocument(key: string, raiseError: boolean): MaybePromise<void>;
}

export interface LlamaIndexChatMessage {
  readonly role: "system" | "developer" | "memory" | "user" | "assistant" | "tool";
  readonly content: string | readonly unknown[];
}

export interface LlamaIndexMemory {
  getLLM(): MaybePromise<LlamaIndexChatMessage[]>;
  add(message: {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
  }): MaybePromise<void>;
  clear(): MaybePromise<void>;
}
