# AIFSD headless workbench

This Node composition runs the repository workbench over three explicit host-owned boundaries:

- Task Graph beta.4 supplies planning, context compilation and the authenticated native task authority client.
- The AIFSD project journal is persisted atomically at `AIFSD_PROJECT_JOURNAL_PATH`.
- Neo4j stores the rebuildable semantic read projection.

## Configuration

The executable requires:

- `AIFSD_TASK_GRAPH_MANIFEST`: canonical Task Graph project manifest.
- `AIFSD_PROJECT_JOURNAL_PATH`: writable path for the accepted-event journal.
- `AIFSD_NATIVE_TASK_INTENT_PATH`: writable path for the pre-effect native command intent store. This must remain durable across process restart and must not alias the accepted-event journal.
- `AIFSD_NEO4J_URI`, `AIFSD_NEO4J_USERNAME`, `AIFSD_NEO4J_PASSWORD` and optionally `AIFSD_NEO4J_DATABASE`.
- `AIFSD_TASK_AUTHORITY_CLIENT_MODULE`: absolute or working-directory-relative module path exporting `taskAuthorityClient` or a default `TaskAuthorityServiceClient`.

The client module is trusted application composition. It owns the authenticated transport session and its credentials. Caller identity is established by that session and is never accepted from a workbench operation body.

Input is newline-delimited JSON on standard input. Claim operations require `eventId`, `taskKey` and `leaseExpiresAt`. Delegation additionally requires the exact `claimFence` and a closed `targetOwner` object with `id` and `kind`.

## Real-task qualification

`bun run qualify:real-task` composes the published deployment-neutral Task Graph Node service and authenticated client over an operator-created canonical ref in a dedicated bare authority store. It requires `AIFSD_QUALIFICATION_REPOSITORY`, `AIFSD_QUALIFICATION_AUTHORITY_REPOSITORY`, `AIFSD_QUALIFICATION_MANIFEST`, `AIFSD_QUALIFICATION_CANONICAL_REF`, `AIFSD_QUALIFICATION_TASK_KEY`, `AIFSD_QUALIFICATION_TASK_PATH`, `AIFSD_QUALIFICATION_JOURNAL`, `AIFSD_QUALIFICATION_TASK_GRAPH_COMMAND`, `AIFSD_QUALIFICATION_REVIEW_ARTIFACT` and `AIFSD_QUALIFICATION_REVIEW_ARTIFACT_DIGEST`.

The review artefact is a separate operator-authority input. Its configured SHA-256 digest must bind the exact artefact bytes, canonical ref, manifest, project, task and qualification-program digest. Evidence admission then binds the exact current authority revision and source identity. Result acceptance requires the admitted evidence event as both its journal-resolved evidence reference and `causationId`. Substituted evidence, task, revision, source or gate claims, and missing or unrelated evidence events, fail closed.

The runner never creates the authority store or ref and never writes the selected worktree or `main`.
