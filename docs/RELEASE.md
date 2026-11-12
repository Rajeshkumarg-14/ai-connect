# Local release checklist

This checkout prepares source and a static website. Publication and GitHub Pages deployment are separate actions; the local preview does not publish content.

1. Review the staged paths and diff. Include only source, public documentation, tests, package manifests, the static site, and integrity manifests.
2. Run `npm ci --ignore-scripts` for a fresh installation, then `npm run build`, `npm run site:build`, `npm run check`, `npm test`, and `npm run coverage`.
3. Run the isolated fixture server and landing preview, then `node scripts/visual-audit.mjs`. Inspect desktop/mobile captures. The browser helper uses an already-installed local Chromium and does not download one.
4. Generate and verify the integrity manifests after the final source and build changes: `npm run integrity:generate` and `npm run integrity:verify`. Record a trusted manifest independently of the files it checks. These hashes are unsigned.
5. Confirm `.connect/`, uploads, transcripts, private handoffs, environment files, credentials, logs, browser profiles, screenshots, caches, release archives, and `node_modules/` are ignored and absent from the index.
6. Retain the MIT license and third-party notices. Inspect provider integration claims: existing-session control is experimental, independent provider tools keep their permissions/network behavior, and checksums/tests are not a security guarantee.
7. Review the remote and existing remote history before any later push. Do not force-push or publish a local development branch automatically.

The public repository is `Rajeshkumarg-14/ai-connect`. The static `site/` tree is designed to work under a GitHub Pages project path using relative assets and links. Do not deploy the Node app to Pages; it needs a local Node process.

The backend line-coverage gate measures all nine backend runtime modules. Frontend behavior, static pages, and build tools have separate checks; the backend percentage must never be presented as repository-wide coverage.

## GitHub Pages publication

The landing site is published from the root of the `gh-pages` branch in the same repository. Only the contents of `site/` belong on that branch. The Node backend, local state, desktop payloads, credentials, and development artifacts are not site assets.

After explicitly authorized site updates, build the site, commit an explicit source allowlist, then use `git subtree split --prefix=site HEAD` and push the returned commit to `origin gh-pages` without force. Configure GitHub Pages to use `gh-pages` and `/(root)`. Review remote history before pushing. Do not rewrite an existing Pages branch to resolve a rejected push.

Public URL: https://rajeshkumarg-14.github.io/ai-connect/
