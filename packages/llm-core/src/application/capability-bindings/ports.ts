import type { CapabilityId } from "#contracts";
import type { CapabilityPortKind } from "./types";

export interface CapabilityPortDefinition {
  readonly capabilityId: CapabilityId;
  readonly requiredMethods: readonly string[];
  readonly requiredProperties?: readonly string[];
  readonly optionalMethods?: Readonly<Record<string, CapabilityId>>;
}

/**
 * Neutral capability identities and runtime shape checks for every bindable
 * feature port. Optional executable surface is evidence-bearing too: a method
 * and its supported/conditional claim must either both be present or both be
 * absent.
 */
export const CAPABILITY_PORT_DEFINITIONS = {
  model: {
    capabilityId: "llm-core.model.generate",
    requiredMethods: ["generate"],
    requiredProperties: ["profile"],
    optionalMethods: { stream: "llm-core.model.stream" },
  },
  "model-output-parser": {
    capabilityId: "llm-core.model.output.parse",
    requiredMethods: ["parse"],
    optionalMethods: { formatInstructions: "llm-core.model.output.format-instructions" },
  },
  "schema-document-resolver": {
    capabilityId: "llm-core.model.schema.resolve",
    requiredMethods: ["resolve"],
  },
  tool: {
    capabilityId: "llm-core.tool.execute",
    requiredMethods: ["validate", "execute"],
    requiredProperties: ["spec"],
  },
  "policy-evaluation": {
    capabilityId: "llm-core.control.policy.evaluate",
    requiredMethods: ["evaluate"],
  },
  "approval-authentication": {
    capabilityId: "llm-core.control.approval.authenticate",
    requiredMethods: ["verify"],
  },
  concurrency: {
    capabilityId: "llm-core.control.concurrency.acquire",
    requiredMethods: ["acquire"],
  },
  "event-sink": {
    capabilityId: "llm-core.evidence.event.emit",
    requiredMethods: ["emit"],
    optionalMethods: { emitMany: "llm-core.evidence.event.emit-many" },
  },
  "tool-receipt-journal": {
    capabilityId: "llm-core.evidence.tool-receipt.journal",
    requiredMethods: ["reserve", "append", "load", "loadByIdempotency"],
  },
  "agent-runner": {
    capabilityId: "llm-core.agent.run",
    requiredMethods: ["capabilities", "prepare", "start"],
    optionalMethods: { resume: "llm-core.agent.resume.checkpoint" },
  },
  "local-skill-loader": {
    capabilityId: "llm-core.agent.skill.load-local",
    requiredMethods: ["load"],
  },
  "document-loader": {
    capabilityId: "llm-core.retrieval.document.load",
    requiredMethods: ["load"],
  },
  "document-transformer": {
    capabilityId: "llm-core.retrieval.document.transform",
    requiredMethods: ["transform"],
  },
  "text-splitter": {
    capabilityId: "llm-core.retrieval.text.split",
    requiredMethods: ["split"],
    optionalMethods: {
      splitBatch: "llm-core.retrieval.text.split-batch",
      splitWithMetadata: "llm-core.retrieval.text.split-with-metadata",
    },
  },
  embedder: {
    capabilityId: "llm-core.retrieval.embedding.generate",
    requiredMethods: ["embed"],
    optionalMethods: { embedMany: "llm-core.retrieval.embedding.generate-many" },
  },
  retriever: {
    capabilityId: "llm-core.retrieval.retrieve",
    requiredMethods: ["retrieve"],
  },
  reranker: {
    capabilityId: "llm-core.retrieval.rerank",
    requiredMethods: ["rerank"],
  },
  "query-engine": {
    capabilityId: "llm-core.retrieval.query",
    requiredMethods: ["query"],
    optionalMethods: { stream: "llm-core.retrieval.query.stream" },
  },
  "response-synthesizer": {
    capabilityId: "llm-core.retrieval.response.synthesize",
    requiredMethods: ["synthesize"],
    optionalMethods: { stream: "llm-core.retrieval.response.stream" },
  },
  indexer: {
    capabilityId: "llm-core.indexing.index",
    requiredMethods: ["index"],
  },
  "vector-store": {
    capabilityId: "llm-core.indexing.vector-store",
    requiredMethods: ["upsert", "delete"],
  },
  "resource-store": {
    capabilityId: "llm-core.storage.resource",
    requiredMethods: ["read", "write", "delete"],
  },
  "key-value-store": {
    capabilityId: "llm-core.storage.key-value",
    requiredMethods: ["list", "getMany", "setMany", "deleteMany"],
  },
  "cache-store": {
    capabilityId: "llm-core.storage.cache",
    requiredMethods: ["get", "set", "delete"],
  },
  "conversation-store": {
    capabilityId: "llm-core.memory.conversation",
    requiredMethods: ["read", "append", "reset"],
  },
  "conversation-state-store": {
    capabilityId: "llm-core.memory.conversation-state",
    requiredMethods: ["load", "save"],
  },
  "image-generation": {
    capabilityId: "llm-core.media.image.generate",
    requiredMethods: ["generate"],
  },
  "speech-generation": {
    capabilityId: "llm-core.media.speech.generate",
    requiredMethods: ["generate"],
  },
  transcription: {
    capabilityId: "llm-core.media.transcribe",
    requiredMethods: ["transcribe"],
  },
  "media-resource-resolver": {
    capabilityId: "llm-core.media.resource.resolve",
    requiredMethods: ["resolve"],
  },
  "media-output-projector": {
    capabilityId: "llm-core.media.output.project",
    requiredMethods: ["project"],
  },
} as const satisfies Record<CapabilityPortKind, CapabilityPortDefinition>;

export const capabilityIdForPort = (kind: CapabilityPortKind): CapabilityId =>
  CAPABILITY_PORT_DEFINITIONS[kind].capabilityId;
