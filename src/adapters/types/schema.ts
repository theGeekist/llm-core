import type { AdapterMetadata } from "./core";

export type Schema = {
  name?: string;
  jsonSchema: unknown;
  kind?: "json-schema" | "zod" | "unknown";
};

export type SchemaField = {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
};

export interface PromptOutputField extends SchemaField {}

export type PromptSchema = {
  name: string;
  description?: string;
  inputs: SchemaField[];
  outputs?: PromptOutputField[];
};

export type PromptTemplate = {
  name: string;
  template: string;
  schema?: PromptSchema;
  metadata?: AdapterMetadata;
};
