# Release Process

This repo uses GitHub Actions for CI, docs, and releases.

## CI

Runs on every push/PR:

- `bun run lint`
- `bun run typecheck`
- `bun run typecheck:tests`
- `bun test`
- Codecov upload

## Docs Site (VitePress)

Docs are built from the `docs/` folder and published to GitHub Pages.

```bash
bun run docs:dev
bun run docs:build
bun run docs:preview
```

Docs deploy is triggered by pushes to `main`.

## Releases

Release workflow triggers on tags:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow:

- installs dependencies
- builds `dist/`
- publishes to npm as `@geekist/llm-core`
- creates a GitHub release

### Required secrets

- `NPM_TOKEN` (npm publish)
- `CODECOV_TOKEN` (if repo is private)
