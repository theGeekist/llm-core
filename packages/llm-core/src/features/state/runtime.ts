/**
 * Core runtime provenance and validation operations. These are deliberately
 * absent from the supported `./state` package front.
 */
export {
  isRegisteredResumableCheckpoint,
  registerRecordedEffect,
  registerResumableCheckpoint,
} from "./lifetimes";
export type { RegisteredResumableCheckpoint } from "./types";
