# Clr Jira Studio

Internal web application scaffold for discovering Jira projects via company SSO + Jira role sync, generating **Epics / Features / Stories** from text and files, reviewing them in **draft phase**, and creating accepted items in Jira with an **immutable submitted history**.

## Confirmed requirements baked into this scaffold

- **Internal tool**
- **Company SSO** for authentication
- **Jira role-based authorization** for creation permissions
- **Single parent chain**: `Epic -> Feature -> Story`
- **Feature is a native Jira issue type**
- Support creation modes:
  - Epic only
  - Feature only
  - Story only
  - Epic + suggested Features
  - Epic + suggested Features + suggested Stories
  - Feature + suggested Stories
- **Draft phase** and **Submitted phase** are explicit and separate
- Users can **partially accept** a generated hierarchy; only accepted items are created in Jira
- Dashboard history shows **what this app generated/submitted**, not necessarily current Jira state
- Accepted/submitted items are **immutable in this dashboard**
- File inputs supported on day 1:
  - PDF
  - TXT
  - Markdown
  - DOCX
  - Images
- Team templates support:
  - prompt packs
  - required Jira fields
  - labels/components
  - naming conventions
  - issue-link rules
- Template visibility:
  - team-private
  - public reusable
- Copilot instructions / agents / skills / hooks / scripts execute **on the server built here**

## Stack

- **Web**: Next.js App Router + Tailwind + TypeScript
- **API**: NestJS + TypeScript
- **Worker**: Node worker scaffold for ingestion and generation jobs
- **Shared contracts**: domain types in `packages/shared`

## Monorepo layout

```text
apps/
  web/        Next.js UI
  api/        NestJS backend
  worker/     ingestion + generation worker skeleton
packages/
  shared/     shared contracts, enums, DTOs
```

## What is scaffolded

- app structure
- starter UI pages
- shared domain contracts
- backend module boundaries
- draft vs submitted model
- partial acceptance model
- template schema shape
- file ingestion shape
- server-side generation provider abstraction
- architecture notes and implementation plan

## What is deliberately not implemented yet

- real SSO integration
- real Jira API integration
- real database persistence
- object storage
- job queue
- OCR / document parsing
- actual Copilot executor bridge

That omission is intentional. A scaffold should encode structure and constraints first. Prematurely hardwiring vendors before the domain model settles is how these apps rot.

## Suggested implementation order

1. Company SSO login
2. Jira connection + project/role discovery sync
3. Postgres schema + persistence
4. Template CRUD + versioning + public publishing rules
5. File upload + storage + ingestion queue
6. Draft generation provider runner
7. Review tree + partial acceptance flow
8. Jira creation transaction + immutable submitted snapshot
9. Audit trail + observability

## Local development

```bash
pnpm install
pnpm dev:web
pnpm dev:api
pnpm dev:worker
```

## Environment variables

Each app contains an `.env.example` file scaffold. These are placeholders for Copilot to wire up.

## Primary design rule

This application is **not** a second Jira editor.

It is a:
- discovery layer
- template layer
- generation layer
- review layer
- submission/audit layer

Once items are submitted, Jira owns operational changes. This app owns provenance and auditability.
