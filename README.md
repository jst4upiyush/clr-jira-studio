# Clr Jira Studio

Internal web application scaffold for discovering Jira projects via company SSO + Jira role sync, generating **Epics / Features / Stories** from text and files, reviewing them in a **draft phase**, and creating accepted items in Jira with an **immutable submitted history**.

## Stack

- **Web**: Next.js App Router + Tailwind + TypeScript
- **API**: NestJS + TypeScript
- **Worker**: Node worker scaffold for ingestion and generation jobs
- **Shared contracts**: domain types in `packages/shared`
- **Local services**: Jira Software + Postgres via Docker Compose

## Monorepo layout

```text
apps/
  web/        Next.js UI
  api/        NestJS backend
  worker/     ingestion + generation worker scaffold
packages/
  shared/     shared contracts, enums, DTOs
scripts/
  dev-all.mjs single-command local launcher
```

## Local prerequisites

Install these before starting the app locally:

- Node.js 20+
- pnpm 10+
- Docker Desktop (or another Docker engine with `docker compose` available)

## Install dependencies

```bash
pnpm install
```

## Configure the root environment file

The repository uses a **root** `.env` file for both Docker services and the app processes.

1. Copy `.env.example` to `.env` if you do not already have one.
2. Set these required values:

- `JIRA_BASE_URL` — usually `http://localhost:8080`
- `JIRA_PAT` — Jira personal access token for the local Jira instance
- `JIRA_DEFAULT_USER` — Jira username that should be used as the local app session
- `NEXT_PUBLIC_API_BASE_URL` — usually `http://localhost:4000/api`
- `POSTGRES_PASSWORD`
- `ATL_JDBC_PASSWORD` — should match `POSTGRES_PASSWORD`

If Jira credentials are missing, the API now starts in **setup mode** instead of failing silently. The web app stays usable and shows setup guidance on Jira-backed pages.

## Start everything with one command

From the repository root, run:

```bash
pnpm dev
```

That command:

1. starts Docker services for **Postgres** and **Jira**
2. starts the **API** watcher on port `4000`
3. starts the **Next.js web app** on port `3000`
4. starts the **worker** watcher

Press `Ctrl+C` to stop the app processes. Docker containers keep running until you stop them separately.

> Jira itself can take a few minutes to finish booting after the container first reports `Up`. During that warm-up window, the frontend routes still load, but Jira-backed pages can temporarily show setup guidance until Jira stops returning upstream `503` responses.

## Verify the app locally

After `pnpm dev` is running:

1. Open `http://localhost:3000/dashboard`
2. Open `http://localhost:3000/settings`
3. Check `http://localhost:4000/api/jira/status`

Expected behavior:

- if Jira env vars are configured and Jira is reachable, the API reports `configured: true`
- if Jira env vars are missing, the API reports `configured: false` and a helpful message
- after `pnpm dev` first starts Jira, expect a warm-up period before Jira-backed routes such as `/api/jira/projects` succeed; refresh the app once Jira has finished starting
- the dashboard, settings, create, and history pages render cleanly instead of surfacing avoidable runtime 500s during local setup
- draft creation and Jira submission remain intentionally blocked until Jira is actually configured

## Notes on current local Jira behavior

This repository already contains Jira-backed search and creation flows. Local validation of the remaining feature-dependent creation flows is still blocked by **external Jira project configuration** when the connected Jira instance does not expose a native `Feature` issue type in the visible projects.

## Primary design rule

This application is **not** a second Jira editor.

It is a:

- discovery layer
- template layer
- generation layer
- review layer
- submission/audit layer

Once items are submitted, Jira owns operational changes. This app owns provenance and auditability.
