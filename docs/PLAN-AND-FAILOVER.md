# Approved plans and quota continuation

Automatic continuation is off by default. A human must explicitly save and approve a plan, enable failover in that room, and configure compatible managed agents. Plan approval stores the exact text, a revision ID, an approval timestamp, and a SHA-256 digest. Only the authenticated human API can approve a plan; peer messages and MCP tools cannot grant approval or change the room budget.

When an agent reports a provider usage/quota limit, Connect may hand its saved request to an idle agent from the other provider in the same room. The fallback must already have the same role: a reviewer cannot be promoted to builder. The configured fallback is used when one is selected. Missing authentication, process-launch errors, timeouts, and ordinary CLI failures do not trigger continuation.

The handoff includes the approved plan and digest, original request, attached files, recent room context, and unfinished task IDs. Source-owned tasks that are in progress transfer to the fallback only when its turn can start; an immediately blocked start rolls ownership back. The fallback receives instructions to inspect actual project state, avoid repeating completed work, decide routine details within the plan, and ask the human about changes in scope or permissions.

Each original message can use at most one automatic handoff, and every new launch consumes the normal room turn budget. Archiving, stopping the room, or shutting down Connect prevents new automatic launches. A restart interrupts active handoff records rather than replaying them.

When both compatible agents were already running the same broadcast message under the same approved-plan revision, Connect recognizes the surviving agent's existing turn. It does not launch a duplicate or consume another turn. Source-owned tasks are not silently reassigned in that case; the room records that they remain for explicit follow-up.

If approval, a compatible agent, or budget is missing, Connect records an assistance request instead of expanding permissions. Agents can also use the `request_assistance` MCP tool to ask a question and end their turn. Automatic replies skip agents awaiting a human decision. An explicit human answer can be sent as a note or run as a new targeted turn. Resolving an assistance request does not bypass provider limits.

Handoff completion means the fallback turn ended successfully. It does not independently prove that every item in the approved plan is correct or complete; inspect its changes, tests, findings, and unresolved tasks.
