# Deterministic scenario coverage

The scenario catalog contains **1,580 individually named, executable Node.js test cases**. These are parameterized behavior tests, not a list of claimed scenarios: every catalog entry is registered with `node:test` and executes assertions against the application logic or an isolated HTTP/filesystem fixture.

Run the catalog summary with `node scripts/scenario-catalog.mjs`, or add `--full` to print every ID and its parameters. Run its tests with `node --test tests/scenarios.test.mjs`; `npm test` also includes them with the focused integration tests.

| Category | Cases | What is asserted |
| --- | ---: | --- |
| Notification channels | 384 | Global enable, in-app/browser/sound channels, reply/error flags and quiet-hours interaction for three event kinds |
| Quiet hours | 288 | All 24 local hours, three timezones, daytime/overnight/all-day/disabled windows with inclusive starts and exclusive ends |
| Notification overrides | 72 | Session mute/enable/unset, global pause, archived room, hidden session and three event categories |
| Quota handoff | 256 | Two source providers, source/fallback roles, four fallback statuses, approval, feature flag and available/exhausted budget |
| Input boundaries | 48 | Minimum/maximum/over-limit text plus empty, whitespace, numeric, null and object inputs for six product fields |
| Room updates | 40 | Boolean settings, turn limits and fallback selection; invalid patches must not partially toggle automation |
| Task ownership | 72 | Provider/role combinations, unowned/self/other ownership, room scoping and three task states |
| Finding transitions | 18 | Three severities, three workflow states and same-room/cross-room actors |
| Invalid MCP envelopes | 19 | Null/primitive/array envelopes, protocol/method/ID errors and malformed parameter shapes |
| MCP request IDs | 30 | Valid numeric/string/null IDs across supported and unsupported methods |
| MCP tool outcomes | 36 | Every tool's successful response, thrown Error, thrown string, and invalid arguments |
| MCP versions | 6 | Four supported versions plus unknown/missing fallback negotiation |
| Source uploads | 60 | Twenty source/text extensions with plain, traversal and Windows-path names; UUID storage and path redaction |
| Invalid uploads | 16 | Bad/empty/base64/binary/executable/archive/vector/image/PDF input, missing/archived room and size overflow |
| Attachment batches | 12 | Four media kinds and one/two/five attachments with cross-room rejection |
| HTTP authentication | 72 | Eighteen routes with missing/wrong tokens, cross-origin requests and unrecognized Host |
| HTTP body errors | 24 | Malformed/primitive/array/empty/oversized JSON under three content-type states |
| Transcript identifiers | 36 | Traversal, malformed IDs and provider mismatch, including valid counterpart requests |
| Transcript cursors | 12 | Negative/fractional/text/object/oversized/out-of-range cursors and valid boundary forms |
| Transcript pagination | 24 | Both providers, six page sizes and newest/earlier positions with chronological/nonoverlapping pages |
| Corrupted persistence | 8 | Invalid state is rejected without replacing the original bytes |
| Restart recovery | 15 | Three roles and five saved statuses, with interrupted worker normalization and historical error preservation |
| Queue saturation | 16 | Both providers/roles with zero/seven/eight/nine queued requests and bounded cancellation |
| Worker lifecycle | 10 | Both providers under timeout, stop, server close, output limit and disconnected stdin/process failure |
| Message waits | 6 | Immediate/bounded timeout, pre/post abort, room stop and arrival of a new addressed message |

The original focused integration tests additionally exercise real fake-process execution, MCP-to-broker scoping, same-request broadcast continuation, actual upload bytes/download headers, consent gates, notification scheduling, explicit native-session monitoring, and archive/delete preservation.

## Isolation and limits

Most combinatorial cases run the real Store, AgentManager, notification, upload, and MCP logic with in-memory persistence or event-driven fake CLI processes. Separate tests use actual temporary files, loopback HTTP, and a tiny local Node.js subprocess. This keeps thousands of scenarios deterministic without sending thousands of provider requests. Test files, server state, uploads, transcripts and schedules are isolated from `.connect` and existing user sessions.

The suite does not prove all possible interleavings, native OS permission policies, every provider CLI release, live subscription availability, or a successful Claude native relay connection. Test count is not code coverage or a guarantee of security. Native V8 line, branch and function coverage must be measured separately over all backend runtime modules; a high percentage is never inferred from the number of tests.

The initial scenario run exposed and fixed malformed JSON-RPC envelope crashes, partial room-setting mutation after validation errors, and short-timeout misclassification. None of these fixes bypasses permissions or changes provider authentication.
