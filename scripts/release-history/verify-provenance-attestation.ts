import { X509Certificate } from "node:crypto";
import type { ArtifactMetadata } from "./prepare-artifact";
import { boundedResponseJson } from "./bounded-response";

interface ProvenanceAttestation {
  readonly predicateType?: unknown;
  readonly bundle?: {
    readonly dsseEnvelope?: { readonly payload?: unknown };
    readonly verificationMaterial?: {
      readonly certificate?: { readonly rawBytes?: unknown };
      readonly x509CertificateChain?: {
        readonly certificates?: readonly { readonly rawBytes?: unknown }[];
      };
    };
  };
}

interface ProvenanceVerificationOptions {
  readonly tag: string;
  readonly download?: (url: string) => Promise<unknown>;
}

const record = (value: unknown, name: string): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
};

const certificateBytes = (attestation: ProvenanceAttestation): string | undefined => {
  const direct = attestation.bundle?.verificationMaterial?.certificate?.rawBytes;
  if (typeof direct === "string") return direct;
  const chained =
    attestation.bundle?.verificationMaterial?.x509CertificateChain?.certificates?.[0]?.rawBytes;
  return typeof chained === "string" ? chained : undefined;
};

const downloadAttestation = async (url: string): Promise<unknown> => {
  return boundedResponseJson(url, {
    label: "Attestation download",
    limit: 8 * 1024 * 1024,
  });
};

export const inspectProvenanceIdentity = async (
  url: string,
  artifact: ArtifactMetadata,
  options: ProvenanceVerificationOptions,
): Promise<void> => {
  const response = await (options.download ?? downloadAttestation)(url);
  const attestations = record(response, "attestation response").attestations;
  if (!Array.isArray(attestations)) throw new Error("npm attestation response has no attestations");
  const provenance = attestations.find(
    (entry): entry is ProvenanceAttestation =>
      record(entry, "attestation").predicateType === "https://slsa.dev/provenance/v1",
  );
  const payload = provenance?.bundle?.dsseEnvelope?.payload;
  const certificate = provenance ? certificateBytes(provenance) : undefined;
  if (typeof payload !== "string" || !certificate) {
    throw new Error("npm provenance bundle is incomplete");
  }
  const statement = JSON.parse(Buffer.from(payload, "base64").toString()) as {
    readonly subject?: readonly { readonly digest?: Readonly<Record<string, unknown>> }[];
  };
  const expectedSha512 = artifact.sha512.slice("sha512:".length);
  if (!statement.subject?.some((subject) => subject.digest?.sha512 === expectedSha512)) {
    throw new Error("npm provenance subject does not match the qualified archive");
  }
  const identity = new X509Certificate(Buffer.from(certificate, "base64")).subjectAltName;
  const expectedIdentity = `URI:https://github.com/theGeekist/llm-core/.github/workflows/release.yml@refs/tags/${options.tag}`;
  if (identity !== expectedIdentity) {
    throw new Error("npm provenance identity is not the exact release workflow tag");
  }
};
