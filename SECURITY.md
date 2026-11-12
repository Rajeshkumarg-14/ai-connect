# Security policy

Connect is local software, not a managed security service or a sandbox for untrusted agents. No completed audit or test count proves it free of vulnerabilities.

## Trust boundaries

- The web server binds to loopback and validates Host and Origin, authenticates local sessions, and scopes agent capabilities to rooms.
- Connect itself does not contact analytics, model APIs, cloud storage, update services, or external registries at runtime. Browser requests go to its local server. CLI agents remain independent programs and may contact providers, load configured tools/hooks, and use network access under their own permissions.
- Messages, plans, uploaded files, and transcripts are untrusted content. They do not grant approval. Only the human acceptance/plan routes can record the corresponding decision.
- Other programs running as your OS user, administrators, a compromised browser extension, or a compromised provider CLI are outside Connect's isolation boundary.
- Keep `.connect` private and backed up. It contains conversations, files, local acceptance records, and scoped capabilities. No claim is made that this data is encrypted at rest.
- Never expose the local port publicly or use this app to coordinate agents against repositories you do not trust without reviewing those agents' own sandbox policies.

## Reporting a vulnerability

The public project repository has not been created by this task, so there is no project security inbox or GitHub advisory URL to claim. Contact the maintainer through the public contact channel listed at rajeshkumarg.com and request a private reporting route before sending sensitive details. Do not post credentials, private transcripts, or exploit details in a public issue. Once a repository is published, configure private vulnerability reporting and update this document with that exact route.

Include the affected version, a minimal redacted reproducer, expected and actual behavior, and the relevant boundary. Do not test on other people's agents or data. No response-time commitment or bug-bounty program is currently offered.

## Integrity checks

Build manifests use SHA-256. `npm run integrity:verify` compares local release inputs and outputs with the generated manifest; a mismatch fails the command. Obtain the manifest through a trusted channel. An attacker who can replace both files and their manifest can make them agree. Checksums are not signatures, identity verification, malware detection, or a substitute for review.

## Supported versions

The current pre-release source is the only version maintained in this workspace. There is no published support schedule or automatic update mechanism.
