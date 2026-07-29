import { contractVersion, digest, newCoreId } from "#contracts";
import type { EvidenceId, InvocationContext, ResourceId, SupportedCapabilityClaim } from "#contracts";
import type { ModelContentPart, ModelMessage } from "./content";
import type { Model } from "./model";
import type { ModelProfile } from "./profile";
import { deploymentRef, modelProfileId, modelRef, providerRef } from "./references";
import type { ModelRequest } from "./request";
import type { ModelResponse, ModelUsage } from "./response";

/**
 * Deterministic builtin model — the first executable path for the slice.
 *
 * It reads no environment credentials and depends on no provider SDK. Its
 * capability claim carries self-declared conformance evidence as a placeholder;
 * real suites are produced by the conformance task, not here.
 */

export const BUILTIN_MODEL = modelRef("llm-core.builtin.echo");
export const BUILTIN_PROVIDER = providerRef("llm-core.builtin");
export const BUILTIN_DEPLOYMENT = deploymentRef("llm-core.builtin.local");
export const BUILTIN_TEXT_CAPABILITY = "llm-core.model.text-generation";

// Fixed UUIDv7 values keep the builtin profile deterministic across runs.
const EVIDENCE_ID = newCoreId<EvidenceId>("0190bd0c-0000-7000-8000-000000000001");
const RESOURCE_ID = newCoreId<ResourceId>("0190bd0c-0000-7000-8000-000000000002");
// SHA-256 of the two-byte report body "{}".
const REPORT_DIGEST = "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a";

const builtinTextClaim = (): SupportedCapabilityClaim => ({
  capabilityId: BUILTIN_TEXT_CAPABILITY,
  version: contractVersion("1.0.0"),
  status: "supported",
  evidence: {
    result: "pass",
    report: {
      evidenceId: EVIDENCE_ID,
      kind: "evaluation",
      content: {
        resourceId: RESOURCE_ID,
        mediaType: "application/json",
        byteLength: 2,
        digest: digest(REPORT_DIGEST),
      },
    },
    suiteId: BUILTIN_TEXT_CAPABILITY,
    suiteVersion: contractVersion("1.0.0"),
    observedAt: "2026-07-29T00:00:00.000Z",
    implementationId: "llm-core.builtin.echo",
    implementationVersion: "1.0.0",
    providerId: "llm-core.builtin",
    providerVersion: "1.0.0",
  },
});

/** Recursively freeze an object graph so resolution evidence cannot mutate. */
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
};

export const createBuiltinModelProfile = (): ModelProfile =>
  deepFreeze({
    profileId: modelProfileId("llm-core.builtin.echo"),
    version: contractVersion("1.0.0"),
    model: BUILTIN_MODEL,
    provider: BUILTIN_PROVIDER,
    deployment: BUILTIN_DEPLOYMENT,
    claims: [builtinTextClaim()],
  });

const lastUserText = (messages: ModelMessage[]): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") {
      continue;
    }
    const text = message.content.find(
      (part): part is Extract<ModelContentPart, { kind: "text" }> => part.kind === "text",
    );
    if (text) {
      return text.text;
    }
  }
  return "";
};

const countText = (messages: ModelMessage[]): number =>
  messages.reduce(
    (total, message) =>
      total +
      message.content.reduce(
        (sum, part) => (part.kind === "text" ? sum + part.text.length : sum),
        0,
      ),
    0,
  );

const usageFor = (inputChars: number, outputChars: number): ModelUsage => ({
  inputTokens: inputChars,
  outputTokens: outputChars,
  totalTokens: inputChars + outputChars,
});

/** Create the builtin echo model. Pure and deterministic given its input. */
export const createBuiltinModel = (
  profile: ModelProfile = createBuiltinModelProfile(),
): Model => ({
  profile,
  generate(request: ModelRequest, _context: InvocationContext): ModelResponse {
    const text = lastUserText(request.messages);
    const usage = usageFor(countText(request.messages), text.length);
    const metadata = { provider: profile.provider };

    if (request.responseFormat?.kind === "json") {
      const schema = request.responseFormat.schema;
      const content: ModelContentPart[] = [
        schema
          ? { kind: "json", value: { echo: text }, schema }
          : { kind: "json", value: { echo: text } },
      ];
      return { kind: "completion", content, finishReason: "stop", usage, metadata };
    }

    return {
      kind: "completion",
      content: [{ kind: "text", text }],
      finishReason: "stop",
      usage,
      metadata,
    };
  },
});
