# Backend runtime coverage

Run `npm run coverage` to execute the complete Node.js suite with native V8 coverage and enforce a **98% aggregate line-coverage gate** over every backend runtime module: `server.mjs`, `mcp.mjs`, and all `lib/*.mjs` files. The script verifies that each expected module appears in the report. It does not remove difficult production modules, mark source as ignored, or count test code toward the percentage.

`npm run coverage:report` collects the same measurements without failing solely because the line target is missed. Test failures and missing runtime modules still fail that command. `npm test` remains the regular functional test command.

Generated reports are local, ignored artifacts:

- `output/coverage/summary.json`: measured scope, thresholds, totals and per-file counts.
- `output/coverage/lcov.info`: LCOV data for compatible coverage viewers and CI.
- `output/coverage/run.log`: complete test results and Node's native coverage table.

## Verified measurement

On 12 November 2026, Node.js 26.12.1 on Windows ran **1,649 tests, all passing**, in approximately **4.03 seconds** of test-runner time. All nine backend runtime modules were measured.

| Metric | Result | Gate |
| --- | ---: | --- |
| Lines | 99.42% | At least 98% |
| Branches | 86.56% | Reported, no 98% claim |
| Functions | 91.13% | Reported, no 98% claim |

Eight runtime modules had 100% measured line coverage. `lib/discovery.mjs` had 97.59%; its uncovered lines were native Windows process enumeration/default PID-liveness paths. The suite exercises those discovery contracts with isolated metadata and injected process evidence; it does not query or message an existing user's live agents merely to improve a percentage.

The 98% gate applies to aggregate **backend runtime line coverage**, not every file individually, branch coverage, provider behavior, or the entire repository. Frontend/browser source, the static site, build/release scripts and third-party provider executables are outside this backend measurement. Browser interaction checks are separate; passing them is not a substitute for instrumented frontend coverage.

## What the coverage tests exercise

Focused integration tests supplement the [1,580-case deterministic catalog](TEST-SCENARIOS.md) with authenticated HTTP routes, MCP stdio fragmentation and errors, loopback-only broker URLs, session imports and optional-relay failures, SSE initial/update/limit/disconnect behavior, notification and assistance operations, quota handoff rollback, local upload delivery/downloads, and safe startup/lock recovery under isolated paths.

The exported `startServer` entry retains production defaults but accepts isolated runtime/state paths for lifecycle tests. Tests never write the development application's `.connect` directory. Fake provider subprocesses cannot make model requests. A small Node.js fixture verifies real process streaming; the remaining worker tests use event-driven process doubles.

The expanded suite reproduced and fixed malformed JSON-RPC envelope crashes, partial room-setting mutation on validation failure, very short timeout misclassification, and optional context snapshots including Codex analysis/environment material. The latter now shares the visible-message filtering used by the chat transcript reader.

Coverage measures which code executed, not whether every assumption is correct. This report does not establish a working live Claude relay, provider quota availability, exhaustive scheduling/interleaving behavior, or security against all attackers.
