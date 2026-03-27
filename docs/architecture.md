# Architecture

## Overview

This project is a local-first AI agent platform built as a pnpm workspace. The design keeps the UI, backend, orchestration logic, tools, and persistence modular so you can grow it into a broader local automation system without rewriting the core runtime.

## High-level modules

### `apps/web`

The Next.js UI provides:

- session sidebar
- chat composer and conversation history
- live run status
- approval panel
- execution trace panel
- history dashboard
- runtime settings screen

The frontend talks to the backend over HTTP and subscribes to live run events over SSE.

### `apps/server`

The Express server is the local gateway. It is responsible for:

- receiving prompts
- creating sessions and messages
- starting agent runs
- exposing session/history/settings APIs
- streaming run events
- resolving approval decisions

Server services include:

- `AgentRuntimeService`
- `ApprovalService`
- `AuditLogService`
- `RunStreamService`
- `SessionService`
- `SettingsService`

### `packages/agent-core`

This package contains the agent brain:

- system prompt builder
- provider abstraction
- OpenAI adapter
- Gemini adapter
- mock provider
- permission engine
- execution engine

The execution engine runs a step-limited loop:

1. load prior messages
2. call model with available tool definitions
3. validate tool call
4. request approval if needed
5. execute tool
6. persist result
7. feed tool result back into the model
8. stop on final assistant response or max-step limit

### `packages/tool-registry`

All tools are registered through a common interface:

- `name`
- `description`
- `permissionCategory`
- `schema`
- `timeoutMs`
- `handler`
- structured `summary` and `output`

This keeps provider tool-calling, logging, validation, and execution consistent.

### `packages/local-tools`

Local machine tools currently include:

- `filesystem.list`
- `filesystem.search`
- `filesystem.read`
- `filesystem.write`
- `shell.execute`
- `browser.navigate`
- `browser.extract_text`
- `browser.click`
- `browser.type`
- `system.open_app`

Playwright is wrapped in a reusable browser session manager.

### `packages/google-connectors`

Google support is scaffolded behind OAuth-ready connectors:

- Gmail
- Google Calendar
- Google Drive

Credentials are not hardcoded. Until env values are added, these connectors throw friendly setup errors.

### `packages/db`

Persistence uses MongoDB through a focused repository class with indexes and explicit collections.

Collections:

- `profiles`
- `sessions`
- `conversations`
- `messages`
- `tool_calls`
- `approvals`
- `tasks`
- `memory`
- `settings`
- `audit_logs`

### `packages/shared`

Shared package responsibilities:

- shared contracts and DTOs
- zod schemas
- settings defaults
- env parsing
- utility helpers

## Permission and approval model

Each tool is associated with a permission category. The permission engine combines:

- tool metadata
- approval defaults
- safe roots
- safe shell prefixes
- always-allow browser domains

Examples:

- file listing/search can be auto-approved
- file writes are approval-gated
- shell execution is approval-gated unless explicitly allowed
- browser automation is approval-gated unless a domain allowlist is configured
- Gmail, Calendar, and Drive actions require approval by default

The approval flow is:

1. tool call is requested by the model
2. tool input is validated
3. permission engine decides whether approval is required
4. approval record is written to MongoDB
5. UI shows pending approval
6. user approves or denies
7. execution loop resumes with the decision

## Streaming model

The server uses Server-Sent Events per run:

- `run_started`
- `status`
- `tool_pending_approval`
- `tool_approved`
- `tool_denied`
- `tool_started`
- `tool_result`
- `assistant_message`
- `error`
- `completed`

This gives the UI enough information to render the right-side trace and approval states in realtime without polling.

## Persistence strategy

All major actions are stored:

- prompts
- assistant replies
- tool requests
- approval decisions
- tool results
- tasks
- memory summaries
- audit events

This makes MongoDB Compass immediately useful as a debugging and observability surface during development.

## Provider abstraction

The runtime selects a provider through persisted settings:

- `mock`
- `openai`
- `gemini`

`mock` mode keeps the product usable before API keys are added. It supports basic local flows and explicit setup messaging.

`openai` and `gemini` are isolated behind adapter classes so future providers can be added without rewriting the execution engine.

## Suggested extension points

Natural next expansions:

- richer memory extraction and retrieval
- more robust task planning entities
- additional browser tools like screenshot/download/upload
- Google Docs and Sheets connectors
- user-defined approval presets
- path-level and domain-level allow rules in the UI
- resumable runs after server restarts
- local embeddings and semantic memory search
