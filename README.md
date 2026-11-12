# Connect

A local collaboration workspace and coordination bridge for independent AI coding agents. Create a project room, bring Claude Code and Codex together, share files, assign tasks, and keep review findings beside the conversation.

Created by **Rajesh Kumar G** · [Website](https://rajeshkumarg.com) · [GitHub](https://github.com/Rajeshkumarg-14) · [FetchVolt](https://rajeshkumarg-14.github.io/fetchvolt-site/)

Website: [rajeshkumarg-14.github.io/ai-connect](https://rajeshkumarg-14.github.io/ai-connect/) · [Report an issue](https://github.com/Rajeshkumarg-14/ai-connect/issues)

## Start locally

Requires Node.js 22 or later. Windows 11 is the primary tested environment. Install and authenticate provider CLIs separately if you want managed agent runs.

```sh
npm ci --ignore-scripts
npm start
```

Open [the app](http://127.0.0.1:4318/). The server binds to loopback only. `npm start` builds the UI first. Stop it with Ctrl+C before starting another instance. The PowerShell launcher also checks this development machine’s Dev Drive; other machines can use npm directly.

```sh
npm run site:build
npm run site:preview
```

Preview [the landing site](http://127.0.0.1:4319/). GitHub publication and Pages deployment are separate owner-controlled steps; these commands do not publish anything.

## Work with agents

1. Create a room for an existing absolute project folder.
2. Add a reviewer (read only) or a builder (can edit according to its CLI permissions).
3. Send a task to Everyone or a selected agent. **Send and run** requests a response; turning it off saves a note. Delivery status distinguishes notes, queued work, answers, and errors.
4. Use Tasks for ownership and Findings for evidence-backed review notes. The Agents panel can be hidden to focus on the conversation.
5. Open **Automation** in the agent panel for bounded automatic replies and approved-plan failover. A plan needs explicit human approval. Eligible failover keeps the existing role and budget; it can ask for assistance instead of expanding scope.
6. Stop a running agent or the room to stop Connect-owned work. External terminal sessions remain independent.

Attach up to five text/source, image, PDF, JSON, Markdown, or CSV files per message, up to 8 MiB each. All selected managed recipients receive the same attachment references. Provider tools determine how files are interpreted.

**Live sessions** discovers bounded recent metadata, filters by last activity, and opens saved user/assistant transcripts without starting a model. Recent history is not proof of a running process. Adding a partner creates a separate managed agent in the same project. The optional native Claude relay is experimental and must verify exact-session messaging; importing a transcript alone does not establish live control. See [session discovery](docs/SESSION-DISCOVERY.md).

**Settings** contains General, Notifications, and Activity. Choose a theme, manage room limits, configure notification channels and quiet hours, review activity, and schedule local reminders. Reminders require the server to be running. Per-session bells opt in to bounded native transcript polling. See [notifications](docs/NOTIFICATIONS.md) and [plans/failover](docs/PLAN-AND-FAILOVER.md).

## Local boundaries and consent

Connect and its website make no telemetry, analytics, CDN, or model-API requests. Provider CLIs and compatible MCP clients independently retain their authentication, network connections, tools, project instructions, permissions, and usage limits. Initial dependency installation uses the package registry. This is not an air-gapped-provider promise.

The app records explicit, versioned acceptance before enabling workspace mutations and sensitive session access. Acceptance does not change the MIT license or grant agents additional permissions. Local legal pages are available in the app and site.

State and uploaded copies live under ignored `.connect/`. Keep backups if you need history. State is not encrypted at rest. Local processes running as you or an administrator are outside the isolation boundary. Host/Origin checks, same-site cookies, request tokens, room-scoped agent capabilities, bounded inputs, and text rendering provide defense in depth. Do not expose the server through a public interface or tunnel. A single-writer rule covers managed builders, not unrelated editors. See [security policy](SECURITY.md).

## Validate

```sh
npm run build
npm run check
npm test
npm run coverage
```

The test suite includes 1,580 named generated scenarios plus focused regressions. `npm run coverage` enforces at least 98% line coverage across **all nine backend runtime modules**. Branch/function coverage and uncovered lines are reported separately. It is not a repo-wide or frontend coverage claim. See [coverage scope](docs/COVERAGE.md) and [scenario catalog](docs/TEST-SCENARIOS.md).

Browser audits require an already-installed local Chromium, the isolated fixture server, and site preview server. They install nothing and do not contact real providers:

```sh
node scripts/qa-server.mjs
# In other terminals:
npm run site:preview
node scripts/visual-audit.mjs
```

Audits exercise loading, hangs, recovery, Settings, theme, dropdowns, discovery, transcripts, and six viewport widths. Reports/screenshots go to ignored `output/`. Browser checks are behavioral evidence, not proof of every frontend branch. Real Claude relay pairing remains unverified in this environment; provider quotas can prevent execution.

## Integrity and release

```sh
npm run build
npm run site:build
npm run integrity:generate
npm run integrity:verify
```

SHA-256 manifests cover the allowlisted source, built app, site, tests, and public documentation. Compare against a trusted manifest; an unsigned checksum does not authenticate its publisher or prove security. Build before verifying generated assets. Never publish `.connect`, local transcripts, uploads, tokens, environment files, logs, screenshots, caches, or `node_modules`. See [release checklist](docs/RELEASE.md).

## License and contributions

Original source and UI are [MIT licensed](LICENSE). Dependency notices are included in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); restricted components were removed. Contributions should include focused reproduction and validation evidence. See [contributing](CONTRIBUTING.md). Use the project’s GitHub issue page for ordinary reports; report possible vulnerabilities privately as described in SECURITY.md and avoid sharing logs or conversations containing secrets.
