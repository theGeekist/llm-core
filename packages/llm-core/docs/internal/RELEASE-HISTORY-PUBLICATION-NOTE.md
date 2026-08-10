# Release-history publication corrections

The public `docs/reference/release-history.md` is a project history, not the
forensic provenance ledger from which it was reconstructed. Keep the detailed
evidence in the internal provenance material and use the public document to
explain the major implementation and release eras in plain language.

## Identity corrections

- Do not surface `pipewrk` in public release-history material. It was a change
  to Jason's personal GitHub username for privacy, not a repository move or a
  separate ownership era. Publishing both identities would defeat that purpose
  and create a false historical distinction.
- Describe the legacy source as a historical personal repository. The
  meaningful repository transition is into the `theGeekist` GitHub
  organisation, where `theGeekist/llm-core` is the canonical source for the
  current implementation.
- Keep source organisation lineage separate from npm publication coordinates.
  They describe different things and may change independently.

## npm coordinates

- Legacy releases remain `@jasonnathan/llm-core` because the npm username
  cannot be renamed like the GitHub account.
- Rewrite 1.x releases have used `@geekist/llm-core`.
- The new `@aifsd` npm organisation is the intended future home for llm-core,
  the AIFSD SDK and related packages. The exact first published coordinate is
  still recorded as release history only when publication occurs.
- Refer to the next llm-core release as version `2.0.0`. Do not present
  `@geekist/llm-core@2.0.0` or any `@aifsd/*` coordinate as final until it is
  actually published.

In short: implementation lineage, canonical source repository and npm package
coordinate are related, but independent. The public history should preserve
that distinction without turning repository archaeology into the main story.
