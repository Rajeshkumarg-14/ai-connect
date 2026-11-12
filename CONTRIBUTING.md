# Contributing to Connect

Connect is a local collaboration workspace and coordination bridge for independent coding agents. Original application code and documentation are MIT licensed; contributed code must be your own or permissively licensed with its notices retained.

## Local setup

Use Node.js 22 or later. On this Windows development machine, check `Test-Path P:\` and work through the real `P:\Projects` path. Read the dependency review before installing any new dependencies. Never enable unreviewed installation scripts.

```text
npm ci --ignore-scripts
npm run build
npm test
npm run check
npm run site:build
```

Dependency setup may access the npm registry if packages are not cached. Application runtime and the static landing site do not fetch dependencies, telemetry, fonts, or remote code. Provider CLIs have their own independent network behavior.

## Changes and tests

Keep fixes focused. Add a reproducer for a real bug; use deterministic fixtures instead of paid model calls. Explain which user flow changes and how it was checked. Do not inflate test counts with empty assertions or count catalog entries as passing tests. Scenario coverage is not a guarantee about live provider behavior.

Preserve room scoping, local-only binding, approval boundaries, cancellation, and recovery states. Render agent content as text. Keep tokens out of URLs, browser storage, logs, tests, and screenshots. Do not include real native session transcripts, `.connect` state, or private project paths in contributions.

Use the original components in `src/ui`. Do not reintroduce Commons Clause or other restricted component source into the MIT release. Review every new package's provenance, scripts, license, and dependency changes before execution.

## Proposed public workflow

The repository and landing site are prepared locally; they have not been pushed or published by this task. Once a public repository exists, submit changes through its review workflow. Until then, keep patches local. Do not publish a suspected vulnerability or secret in an issue; follow SECURITY.md.
