# Local-First AI Agent Platform

A local-first automation assistant with:

- Next.js chat UI
- Node/Express backend
- custom agent orchestrator with tool-calling loop
- approval-gated sensitive tools
- MongoDB persistence for chat, tasks, memory, approvals, and audit logs
- local filesystem, shell, browser, and app-opening tools
- Google and Microsoft 365 connector support for mail and calendar workflows

The project is designed to run fully on your local machine first. It defaults to `mock` provider mode so the UI, approvals, audit trail, and persistence still work before you add OpenAI or Gemini credentials.

## Deployment

This repo deploys best as two services:

- `apps/web` on Vercel
- `apps/server` on a Node backend host

See [docs/deployment.md](./docs/deployment.md) for the exact GitHub CI, Vercel, backend, and environment-variable setup.

## Stack

- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: Express + TypeScript
- Agent runtime: custom orchestrator in `packages/agent-core`
- Database: local MongoDB Community instance
- Browser automation: Playwright
- Validation: Zod
- Realtime updates: Server-Sent Events
- Package manager: pnpm

## Workspace layout

```text
apps/
  server/   Express API, SSE stream, approvals, runtime services
  web/      Next.js local chat UI
packages/
  agent-core/         provider adapters, permission engine, execution loop
  db/                 MongoDB repositories, indexes, seed helpers
  google-connectors/  Gmail / Calendar / Drive connector scaffold
  local-tools/        filesystem, shell, browser, and app tools
  shared/             shared contracts, env parsing, defaults
  tool-registry/      tool definitions, schemas, execution wrapper
docs/
  architecture.md
```

## Prerequisites

- Node.js 20+ or newer
- `pnpm`
- MongoDB Community Server running locally
- MongoDB Compass
- Playwright browser binaries

## Exact setup commands

Run these from the project root in PowerShell:

```powershell
cd "c:\Users\pavan\OneDrive\Documents\Internship\Trivitron.ai\personal ai agent"
pnpm.cmd install
Copy-Item apps\server\.env.example apps\server\.env
Copy-Item apps\web\.env.example apps\web\.env.local
pnpm.cmd playwright:install
pnpm.cmd seed
```

## Start MongoDB locally

If MongoDB is installed as a Windows service:

```powershell
Get-Service MongoDB
Start-Service MongoDB
```

If you run MongoDB manually instead:

```powershell
mongod --dbpath C:\data\db
```

If `C:\data\db` does not exist yet:

```powershell
New-Item -ItemType Directory -Force C:\data\db
```

## Run the app

Open two terminals, both in the project root folder.

Terminal 1:

```powershell
cd "c:\Users\pavan\OneDrive\Documents\Internship\Trivitron.ai\personal ai agent"
pnpm.cmd dev:server
```

Terminal 2:

```powershell
cd "c:\Users\pavan\OneDrive\Documents\Internship\Trivitron.ai\personal ai agent"
pnpm.cmd dev:web
```

Then open:

- Web UI: `http://localhost:3000`
- API health: `http://localhost:4000/health`

## Optional combined dev command

```powershell
pnpm.cmd dev
```

## Seed command

```powershell
pnpm.cmd seed
```

This seeds:

- default local profile
- default settings document
- one welcome session
- one sample memory record
- one sample task

## Typecheck and tests

```powershell
pnpm.cmd typecheck
pnpm.cmd test
```

## Build commands

```powershell
pnpm.cmd build
```

## MongoDB Compass verification

Use Compass with:

- URI: `mongodb://localhost:27017`
- database name used by the app: `personal_ai_agent`

After you send a few prompts in the UI, you should see collections like:

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

What to verify in Compass:

1. Open `sessions` and confirm a new session document appears after your first prompt.
2. Open `messages` and confirm both `user` and `assistant` messages are stored.
3. Trigger a sensitive tool request and confirm `approvals` and `tool_calls` populate.
4. Open `audit_logs` to confirm prompt, approval, and tool events are recorded.

## Sample prompts

These are good first checks:

- `List files in "C:\Users\pavan\Downloads"`
- `Search my machine for resume PDFs`
- `Read file "C:\Users\pavan\Downloads\notes.txt"`
- `Open browser and go to https://mail.google.com`
- `Open VS Code`
- `Help me organize my daily work tasks`

## Runtime behavior

Data flow:

1. You send a prompt from the UI.
2. The backend creates or reuses a session and conversation.
3. The user message is stored in MongoDB.
4. The orchestrator calls the selected provider with tool definitions.
5. If a tool is requested, the input is validated and checked against permission rules.
6. Sensitive tools pause in `pending approval`.
7. After approval, the tool executes and the result is written to MongoDB.
8. Tool results are fed back into the orchestrator loop.
9. The final assistant response is streamed back and stored.

## Tool approval defaults

Current defaults are intentionally conservative:

- file listing/search: low-risk and auto-approvable
- file read: approval by default unless safe roots are configured
- file write/delete: approval required
- shell execution: approval required
- browser automation: approval required
- app/process opening: approval required
- Gmail / Calendar / Drive actions: approval required
- external API actions: approval required

You can change approval behavior in the Settings page.

## Google integration notes

Google connectors are scaffolded but gated until credentials are added.

Supported paths are ready for:

- Gmail search / draft / send
- Calendar list / create / update
- Drive search / metadata / download

Until OAuth credentials are added, those tools return friendly setup guidance instead of silently failing.

## Troubleshooting

### `pnpm` is blocked in PowerShell

Use `pnpm.cmd` instead of `pnpm`.

### MongoDB connection fails

- confirm the service is running with `Get-Service MongoDB`
- confirm the URI in `apps/server/.env`
- confirm Compass can connect to `mongodb://localhost:27017`

### The web UI loads but chat actions fail

- confirm the API is running on `http://localhost:4000`
- open `http://localhost:4000/health`
- check `apps/web/.env.local` has `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`

### Browser tools fail

Install Playwright browsers:

```powershell
pnpm.cmd playwright:install
```

### OpenAI or Gemini is selected but no answer comes back

- add the relevant API key to `apps/server/.env`
- restart the server
- switch provider/model in the Settings page if needed
- for Gemini, use a current supported model such as `gemini-2.5-flash`

### Google tools fail immediately

That is expected until OAuth credentials are added in `apps/server/.env`.

## Important env files

Server env file:

- `apps/server/.env`

Web env file:

- `apps/web/.env.local`

## Where to add API keys and credentials

Add these in `apps/server/.env`:

- OpenAI API key: `OPENAI_API_KEY=...`
- Gemini API key: `GEMINI_API_KEY=...`

Google OAuth credentials needed later in `apps/server/.env`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_REFRESH_TOKEN`

Microsoft 365 OAuth credentials supported in `apps/server/.env` or secure connector settings:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TENANT_ID`
- `MICROSOFT_REDIRECT_URI`
- `MICROSOFT_REFRESH_TOKEN`

## Recommended next steps after install

1. Start MongoDB locally if it is not already running.
2. Run `pnpm.cmd install`.
3. Copy the `.env.example` files into real env files.
4. Run `pnpm.cmd seed`.
5. Start the server and web app in separate terminals.
6. Open MongoDB Compass and confirm documents appear.
7. Add your OpenAI and Gemini keys to `apps/server/.env`.
8. Restart the server and switch providers in the Settings page.

## Architecture doc

See [docs/architecture.md](./docs/architecture.md) for module responsibilities, data model notes, and the approval/tool execution flow.
