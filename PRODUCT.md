# Connect

<!-- impeccable:product-schema 1 -->

## Platform
web, served locally on Windows with a Node.js backend.

## Stack
Confirmed by the user: recommended local browser app managing Claude Code and Codex sessions, Node.js backend, no extra packages. Implementation uses native Node.js and browser APIs.

## Users
Developers working on a project with multiple coding agents.

## Product Purpose
Let agents share ideas, exchange messages, review code, find bugs, and act as critics, with a human able to follow and control the collaboration.

## Operating Context
Windows 11, PowerShell 7. Projects on the P: Dev Drive. Claude Code and Codex CLI are installed. Their authentication is managed by the user through the CLIs.

## Capabilities and Constraints
Local project rooms, managed CLI adapters, scoped MCP, durable messages, attachments, tasks, findings, bounded automation, approved-plan failover, local notifications, and session discovery/transcript access. Independent provider CLIs keep their normal network access and permissions. Existing-session relay is experimental; imported context alone is not live control. Agent messages never confer human approval.

## Interface Requirements
A clear, restrained workspace centered on the conversation. Responsive layouts, readable typography, a collapsible Agents panel, and progressive disclosure for Automation. A single Settings entry contains General, Notifications, and Activity. Theme switching, animated original controls, searchable selects, date/time pickers, clear error dialogs/toasts, and bounded loading/retry states preserve functionality without clutter. The website and documentation share a professional editorial design. All original UI is MIT licensed; restricted third-party components were removed at the user’s request.

## Evidence on Hand
User-approved local app scope and current repository implementation. Browser fixtures test six viewport widths without launching real models. Backend coverage is measured independently from frontend behavior.
