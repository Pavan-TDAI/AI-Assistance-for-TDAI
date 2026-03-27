# Deployment Guide

## Hosting Shape

This repo is a monorepo with two separate runtime pieces:

- `apps/web`: Next.js frontend
- `apps/server`: Express API, SSE run stream, local-tool runtime, connector services

For review deployments, use this split:

1. Deploy `apps/web` to Vercel
2. Deploy `apps/server` to a Node host such as Railway, Render, Fly.io, or a VM

This is the practical setup because the backend is not just a simple API. It uses:

- Express server lifecycle
- Server-Sent Events
- browser automation hooks
- local-tool execution

Those backend behaviors are a poor fit for a single Vercel frontend deployment.

## GitHub CI

The repo includes:

- `.github/workflows/ci.yml`

This workflow runs on pushes to `main` and on pull requests. It does:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm --filter @personal-ai/server build`
5. `pnpm --filter @personal-ai/web build`

## Vercel Setup

Create a new Vercel project from this GitHub repository.

Use these settings:

- Framework: `Next.js`
- Root Directory: `apps/web`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm --filter @personal-ai/web build`

Environment variables for the Vercel project:

- `NEXT_PUBLIC_API_BASE_URL`

Set that value to your deployed backend URL, for example:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com
```

Official Vercel monorepo reference:

- https://vercel.com/docs/monorepos

## Backend Setup

Deploy the backend from the same repository on a Node host.

Recommended commands:

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm --filter @personal-ai/server build`
- Start: `pnpm --filter @personal-ai/server start`

Required backend environment variables:

```env
HOST=0.0.0.0
PORT=4000
APP_ORIGIN=https://your-vercel-frontend.vercel.app

MONGODB_URI=...
MONGODB_DB_NAME=personal_ai_agent

DEFAULT_PROVIDER=mock
DEFAULT_OPENAI_MODEL=gpt-4o-mini
DEFAULT_GEMINI_MODEL=gemini-2.5-flash
DEFAULT_OLLAMA_MODEL=llama3.1:8b

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
SAFE_SHELL_COMMANDS=Get-ChildItem,dir,pwd
BLOCKED_SHELL_PATTERNS=
HEADLESS_BROWSER=false
```

## Review Deployment Notes

When you connect the repo to Vercel:

- every branch can get a Preview deployment
- `main` can be your production branch
- preview frontend URLs should point to a preview or shared backend URL

If the backend is not deployed yet, the frontend can still be reviewed visually, but chat and meeting actions will not work.

## Git Push Flow

Once the repo is initialized locally, use:

```powershell
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/Pavan-TDAI/AI-Assistance-for-TDAI.git
git push -u origin main
```

Before pushing, make sure secrets are not tracked:

- `.env`
- `.env.local`
- `.local-vault`
- `client_secret*.json`
