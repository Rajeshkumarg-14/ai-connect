# Verification boundaries

This is a record of bounded engineering checks, not a certification or an exhaustive security audit.

Automated tests exercise loopback Host/Origin checks, same-site session authentication, request-token enforcement, scoped agent capabilities, explicit versioned consent, malformed input, bounded uploads and transcript reads, text rendering contracts, task ownership, limited failover, managed process lifecycle, and local state recovery. Coverage reports name their measured scope and remaining gaps.

Regression tests reproduced and addressed malformed JSON-RPC envelopes, partial room mutation on failed validation, timeout classification, and context snapshots containing analysis/environment records. Transcript and optional snapshot filtering now share the visible-message policy.

The browser audits use isolated synthetic data and exercise responsive app/site layouts, loading success and failures, a hung bootstrap, retry, settings navigation, themes, dropdowns, tasks, findings, and saved transcripts. They verify no external HTTP requests during those tested UI flows. They do not authenticate a provider or contact an existing user's agent.

Remaining boundaries include independent provider CLI behavior, normal provider connections and costs, experimental native relay support, platform-specific process discovery, untested frontend branches, local processes with the same OS permissions, and administrators. Local history is not encrypted at rest. A single-writer rule coordinates managed agents only.

Checksums detect changes relative to a trusted manifest. They do not authenticate an unsigned publisher, prevent tampering when both files and manifest are replaced, or prove the absence of vulnerabilities. See [SECURITY.md](../SECURITY.md) for reporting guidance and [coverage](COVERAGE.md) for exact measurements.
