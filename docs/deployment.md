# Deployment Guide

## Recommended Deployment Shape

This monorepo has two runtime targets:

- `apps/web`: Next.js frontend
- `apps/server`: Express API, SSE stream, connector services, local-tool runtime

Use this split in production:

1. Deploy `apps/web` to Vercel
2. Deploy `apps/server` as a Dockerized Node service on Railway, Render, Fly.io, a VM, or another container host

The backend should not be deployed to Vercel. It relies on a long-running Express server, Server-Sent Events, local-tool execution, and connector workflows that are a poor fit for Vercel serverless functions.

## What Is Included In This Repo

Deployment artifacts added to the repo:

- [compose.yml](../compose.yml)
- [.env.docker.example](../.env.docker.example)
- [apps/server/Dockerfile](../apps/server/Dockerfile)
- [apps/web/Dockerfile](../apps/web/Dockerfile)
- [.github/workflows/ci.yml](../.github/workflows/ci.yml)
- [.github/workflows/vercel-web.yml](../.github/workflows/vercel-web.yml)

## Local Docker Run

### 1. Create the Docker env file

From the repo root:

```powershell
Copy-Item .env.docker.example .env.docker
```

Update `.env.docker` with any real provider or connector secrets you want the containers to use.

### 2. Start the stack

```powershell
docker compose --env-file .env.docker up --build
```

Services exposed locally:

- web: `http://localhost:3000`
- api: `http://localhost:4000`
- health: `http://localhost:4000/health`
- mongo: `mongodb://localhost:27017`

### 3. Stop the stack

```powershell
docker compose --env-file .env.docker down
```

If you also want to remove the MongoDB volume:

```powershell
docker compose --env-file .env.docker down -v
```

## Docker Notes

- The compose stack uses `mongo:7.0` plus separate web and server images built from this repo.
- The backend container overrides `HOST=0.0.0.0` and defaults Mongo to `mongodb://mongo:27017`.
- `OLLAMA_BASE_URL` defaults to `http://host.docker.internal:11434` so a host-machine Ollama instance can still be reached from the container.
- Uploads are persisted in a named Docker volume mounted at `/workspace/apps/server/.tdai-uploads`.

Important runtime caveat:

- Filesystem, shell, and browser tools execute inside the container, not on your Windows host.
- That means local-tool behavior in Docker is useful for deployment validation, but it is not identical to the native local-first experience on your machine.

## GitHub Actions

### CI workflow

File:

- [ci.yml](../.github/workflows/ci.yml)

This workflow runs on pull requests, pushes to `main`, and manual dispatch. It does:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build`
5. `docker compose --env-file .env.docker.example config`
6. Docker image validation for both `apps/server/Dockerfile` and `apps/web/Dockerfile`

### Vercel deployment workflow

File:

- [vercel-web.yml](../.github/workflows/vercel-web.yml)

This workflow deploys only the frontend:

- preview deployment on pull requests
- production deployment on pushes to `main`
- manual production deployment with `workflow_dispatch` when run from `main`

Required GitHub repository secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## Vercel Project Setup

Create a Vercel project for the frontend only.

Recommended Vercel settings:

- Framework Preset: `Next.js`
- Root Directory: `apps/web`

Frontend runtime env required in Vercel:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend.example.com
```

If you use the GitHub Actions workflow for deployment, avoid enabling a second overlapping Git-based deployment path in Vercel for the same branch flow, otherwise you can end up with duplicate builds.

## Backend Deployment Setup

Deploy the API as a Docker service using [apps/server/Dockerfile](../apps/server/Dockerfile).

Minimum backend environment variables:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
APP_ORIGIN=https://your-frontend.vercel.app

MONGODB_URI=...
MONGODB_DB_NAME=personal_ai_agent

DEFAULT_PROVIDER=mock
DEFAULT_OPENAI_MODEL=gpt-4o-mini
DEFAULT_GEMINI_MODEL=gemini-2.5-flash
DEFAULT_OLLAMA_MODEL=llama3.1:8b
```

Optional provider and connector variables:

```env
OPENAI_API_KEY=
GEMINI_API_KEY=
OLLAMA_BASE_URL=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_REFRESH_TOKEN=

MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=organizations
MICROSOFT_REDIRECT_URI=
MICROSOFT_REFRESH_TOKEN=

SAFE_ROOTS=
SAFE_SHELL_COMMANDS=
BLOCKED_SHELL_PATTERNS=
HEADLESS_BROWSER=false
```

## Suggested Push Flow

After you review the files locally:

1. Run the Docker stack with `docker compose --env-file .env.docker up --build`
2. Verify `http://localhost:3000` and `http://localhost:4000/health`
3. Push the repo to GitHub
4. Add the Vercel secrets in GitHub
5. Create the Vercel project with `apps/web` as the root directory
6. Point `NEXT_PUBLIC_API_BASE_URL` to the deployed backend URL

## Secret Hygiene

Do not commit:

- `.env`
- `.env.local`
- `.env.docker`
- `.local-vault`
- `client_secret*.json`
