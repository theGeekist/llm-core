import type { AdapterMetadata } from "./core";

export type Schema = {
  name?: string | null;
  jsonSchema: unknown;
  kind?: "json-schema" | "zod" | "unknown" | null;
};

export type SchemaField = {
  name: string;
  type: string;
  description?: string | null;
  required?: boolean | null;
};

export interface PromptOutputField extends SchemaField {}

export type PromptSchema = {
  name: string;
  description?: string | null;
  inputs: SchemaField[];
  outputs?: PromptOutputField[] | null;
};

export type PromptTemplate = {
  name: string;
  template: string;
  schema?: PromptSchema | null;
  metadata?: AdapterMetadata | null;
};
