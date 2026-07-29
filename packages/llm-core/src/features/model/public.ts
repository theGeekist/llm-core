/**
 * Public front door for the model capability (ADR-001).
 *
 * This is the only surface other features, the application layer, and adapters
 * may import. Deep imports into the module files above are prohibited.
 */
export * from "./references";
export * from "./content";
export * from "./request";
export * from "./response";
export * from "./profile";
export * from "./resolver";
export * from "./model";
export * from "./builtin";
export * from "./schema-resolution";
export * from "./prompting";
// ADR-008 publishes media capability contracts through the curated ./model front.
export * from "../media/public";
