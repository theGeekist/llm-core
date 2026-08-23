import { resolve } from "node:path";
import { createHeadlessWorkbenchCli } from "../../packages/aifsd/src/project-semantics/adapters/cli/public.js";
import { createFileProjectJournal } from "../../packages/aifsd/src/project-semantics/adapters/file-journal/public.js";
import { contentDigest } from "../../packages/aifsd/src/config/content-digest.js";
import { createHeadlessWorkbenchNeo4j } from "./neo4j.js";
import { createFileNativeTaskIntentStore } from "./file-native-task-intent-store.js";
import { createHeadlessWorkbenchRuntime, createProjectAdmissionDecisionClock } from "./runtime.js";
import { loadTaskAuthorityClient } from "./task-authority-client.js";

const manifestPath = process.env.AIFSD_TASK_GRAPH_MANIFEST;
const journalPath = process.env.AIFSD_PROJECT_JOURNAL_PATH;
const nativeTaskIntentPath = process.env.AIFSD_NATIVE_TASK_INTENT_PATH;
const neo4jUri = process.env.AIFSD_NEO4J_URI;
const neo4jPassword = process.env.AIFSD_NEO4J_PASSWORD;
const taskAuthorityClientModule = process.env.AIFSD_TASK_AUTHORITY_CLIENT_MODULE;

if (manifestPath === undefined)
  throw new Error("AIFSD_TASK_GRAPH_MANIFEST is required at composition.");
if (journalPath === undefined)
  throw new Error("AIFSD_PROJECT_JOURNAL_PATH is required at composition.");
if (nativeTaskIntentPath === undefined)
  throw new Error("AIFSD_NATIVE_TASK_INTENT_PATH is required at composition.");
if (neo4jUri === undefined || neo4jPassword === undefined)
  throw new Error("AIFSD_NEO4J_URI and AIFSD_NEO4J_PASSWORD are required at composition.");
if (taskAuthorityClientModule === undefined)
  throw new Error("AIFSD_TASK_AUTHORITY_CLIENT_MODULE is required at composition.");

const resolvedManifestPath = resolve(manifestPath);
const repositoryAuthorityId = "aifsd-headless-workbench-repository-corpus";
const admissionAuthorityId = "aifsd-headless-workbench-repository-admission";
const nativeAuthorityId = "aifsd-headless-workbench-task-graph-authority";
const trustedOperations = new Set([
  "recordObservation",
  "compileTaskContext",
  "deriveReadiness",
  "explainBlockers",
  "projectStatus",
  "claimTask",
  "delegateWork",
]);
const taskAuthorityClient = await loadTaskAuthorityClient(taskAuthorityClientModule);
const journal = createFileProjectJournal(resolve(journalPath), { digest: contentDigest });
const decisionClock = createProjectAdmissionDecisionClock();

const neo4j = await createHeadlessWorkbenchNeo4j({
  database: process.env.AIFSD_NEO4J_DATABASE,
  password: neo4jPassword,
  uri: neo4jUri,
  username: process.env.AIFSD_NEO4J_USERNAME ?? "neo4j",
});
const runtime = await createHeadlessWorkbenchRuntime({
  admissionAuthority: {
    authorityId: admissionAuthorityId,
    decide: (request, context) => {
      const observation = request.observation;
      const trustedRepository =
        observation.sourceAuthority.authorityId === repositoryAuthorityId &&
        observation.sourceAuthority.kind === "integration" &&
        observation.provenance.sourceKind === "repository" &&
        observation.provenance.sourceRef === resolvedManifestPath &&
        observation.evidence.length === 1 &&
        (observation.kind === "assertions.recorded" ||
          observation.kind === "correction.accepted" ||
          observation.kind === "observation.accepted");
      const trustedNativeReceipt =
        observation.sourceAuthority.authorityId === nativeAuthorityId &&
        observation.sourceAuthority.kind === "integration" &&
        observation.provenance.sourceKind === "integration" &&
        observation.provenance.sourceRef ===
          taskAuthorityClient.projectRegistration.projectInstanceId &&
        observation.evidence.length === 1 &&
        observation.kind === "observation.accepted";
      return trustedRepository || trustedNativeReceipt
        ? {
            authority: { authorityId: admissionAuthorityId, kind: "coordinator" },
            decidedAt: decisionClock.decidedAt(observation.observedAt, context),
            decisionId: `headless-workbench:${observation.observationId}`,
            policyId: "headless-workbench/repository-observation-v1",
          }
        : null;
    },
  },
  journal,
  manifestPath: resolvedManifestPath,
  nativeTaskIntents: createFileNativeTaskIntentStore(resolve(nativeTaskIntentPath)),
  projection: neo4j.projection,
  taskAuthorityClient,
});
const cli = createHeadlessWorkbenchCli({
  authorise: (operation) =>
    typeof operation.kind === "string" && trustedOperations.has(operation.kind),
  corpusSource: runtime.source,
  workbench: runtime.workbench,
});
try {
  const input = await new Response(Bun.stdin.stream()).text();
  const operations = input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  if (operations.length === 0)
    throw new Error("The headless workbench expects one JSON operation per line.");

  let exitCode: 0 | 1 = 0;
  for (const operation of operations) {
    const response = await cli.execute(operation);
    console.log(response.output);
    if (response.exitCode !== 0) exitCode = 1;
  }
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await neo4j.close();
}
