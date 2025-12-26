import type { AdapterMetadata } from "./core";

export type Document = {
  id?: string;
  text: string;
  metadata?: AdapterMetadata;
  score?: number;
};
