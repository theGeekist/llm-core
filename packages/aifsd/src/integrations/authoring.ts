import { snapshot } from "@aifsd/strict-json";
import type {
  AuthoringProposal,
  AuthoringRequest,
  IntegrationManifest,
  IntegrationResult,
  ProposedFile,
} from "./contract.js";
import { integrationContentDigest } from "./content-identity.js";
import { validateIntegrationManifest } from "./validation.js";

const proposedFile = (path: string, content: string): ProposedFile => ({
  path,
  ownership: "integration",
  content,
  contentDigest: integrationContentDigest(content),
});

const skeletonFiles = (manifest: IntegrationManifest): readonly ProposedFile[] => {
  const metadata = `${JSON.stringify(manifest, null, 2)}\n`;
  const support = `${JSON.stringify({ operations: manifest.operations, upstreams: manifest.upstreams }, null, 2)}\n`;
  const packageName = manifest.identity.name;
  return [
    proposedFile("integration/manifest.json", metadata),
    proposedFile("integration/support-matrix.json", support),
    proposedFile(
      "src/index.ts",
      [
        `// Native binding for ${packageName}.`,
        "// Execution remains owned by this integration and requires an AIFSD activation grant.",
        'export const integrationName = "' + packageName.replaceAll('"', '\\"') + '";',
        "",
      ].join("\n"),
    ),
    proposedFile(
      "qualification/native-probe.ts",
      "// Execute the pinned upstream through its native public entrypoint and emit observations.\n",
    ),
    proposedFile(
      "README.md",
      `# ${packageName}\n\nGenerated proposal. Support claims remain untrusted until qualification passes.\n`,
    ),
  ];
};

export const createIntegrationProposal = (
  request: AuthoringRequest,
): IntegrationResult<AuthoringProposal> => {
  const manifestResult = validateIntegrationManifest({
    schemaVersion: "1.0.0",
    identity: request.identity,
    integrationClass: request.integrationClass,
    capabilities: request.capabilities,
    upstreams: request.upstreams,
    operations: request.operations,
    entrypoints: {
      metadata: "./integration/manifest.json",
      qualification: "./qualification/native-probe.ts",
      native: "./src/index.ts",
    },
    permissions: request.permissions,
  });
  if (!manifestResult.ok) return manifestResult;
  const files = skeletonFiles(manifestResult.value);
  const proposal: AuthoringProposal = {
    status: "proposal",
    manifest: manifestResult.value,
    files,
    proposalDigest: integrationContentDigest({ manifest: manifestResult.value, files }),
  };
  return { ok: true, value: snapshot(proposal) as unknown as AuthoringProposal };
};
