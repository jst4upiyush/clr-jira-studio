# Architecture Overview

## Product intent

Clr Jira Studio is an internal orchestration layer for structured Jira backlog creation. It discovers the Jira projects the user is allowed to operate on, uses templates plus server-side generation providers to propose Epics / Features / Stories, allows the user to review and partially accept the proposal, and then creates only the accepted items in Jira.

The app keeps two distinct states:

1. **Draft**: mutable, iterative, reviewable.
2. **Submitted**: immutable snapshot of what the user accepted and what the app attempted to create in Jira.

That separation is not optional. Without it, the dashboard becomes an unreliable second system of record.

## High-level architecture

```text
[Next.js Web UI]
      |
      v
[NestJS API]
  |     |      \
  |     |       +--> [Jira Adapter]
  |     +----------> [Generation Provider Runner]
  |                 |    +--> instructions
  |                 |    +--> agent workflows
  |                 |    +--> skills/hooks/scripts
  |                 |
  +---------------> [Postgres]
  |                 |    +--> users, teams, memberships
  |                 |    +--> jira projects, roles, metadata
  |                 |    +--> templates + versions
  |                 |    +--> draft sets + draft items
  |                 |    +--> submitted sets + submitted items
  |                 |    +--> audit events
  |
  +---------------> [Object Storage]
  |
  v
[Worker]
  +--> file ingestion
  +--> document parsing
  +--> generation jobs
  +--> async Jira submission retries
```

## Identity and access

### Authentication
- Company SSO
- internal user identity mapped to team membership

### Authorization
- effective create permissions come from **Jira roles**
- API must enforce these permissions
- UI should only reflect capabilities; it should not be the source of truth

## Core domain areas

### 1. Project discovery
Responsibilities:
- fetch Jira projects available to the user
- discover issue type support
- confirm support for Epic / Feature / Story
- cache project metadata and role-derived capabilities

### 2. Template management
Template model includes:
- ownership: user/team
- visibility: team/public
- status: draft/published/archived
- supported scopes and levels
- prompt packs
- required Jira fields
- labels/components presets
- naming conventions
- issue-link rules
- version history

### 3. File ingestion
Input modalities:
- free text
- PDF
- TXT
- Markdown
- DOCX
- images

Ingestion pipeline should:
- validate MIME and size
- store source file metadata
- extract structured text where applicable
- retain references for audit and regeneration

### 4. Draft generation
Generation request should capture:
- project
- scope
- template version
- user prompt text
- uploaded files
- defaults (story points, start, end)
- provider selection/version

Generation output should produce a normalized tree of draft nodes.

### 5. Review and partial acceptance
User actions:
- review generated structure
- choose accepted subset
- optionally reject specific branches
- submit only accepted nodes

Important rule:
- accepting a child without its required parent is invalid unless the selected scope natively allows it
- for example, if the chosen acceptance includes Stories under a Feature, the Feature must either already exist in Jira or be included in the accepted set

### 6. Submitted snapshot
Once submitted:
- snapshot is immutable
- stored payload includes template/provider provenance
- stores exact accepted nodes and returned Jira keys
- no editing via dashboard
- only deep link to Jira for operational changes

## Persistence model

Recommended tables:

- `users`
- `teams`
- `team_memberships`
- `sso_identities`
- `jira_project_access`
- `jira_project_capabilities`
- `templates`
- `template_versions`
- `template_prompt_packs`
- `draft_sets`
- `draft_items`
- `draft_item_attachments`
- `submission_sets`
- `submission_items`
- `jira_issue_links`
- `audit_events`

## Submission semantics

This is the correct lifecycle:

1. create draft set
2. review tree
3. user selects accepted nodes
4. validate hierarchy completeness
5. create immutable submission snapshot
6. submit to Jira
7. record Jira keys / failures
8. never allow dashboard edits on submitted snapshot

Do not collapse steps 5 and 6 into a loose UI action without persistence. If Jira creation partially fails, you need a stable submission record to recover or retry.

## Failure cases worth designing for early

1. Jira project allows Story creation but not Feature creation.
2. Template requires a field not present in selected project.
3. Uploaded file parses poorly or is image-only.
4. Partial acceptance results in orphaned nodes.
5. Generation provider returns structurally invalid hierarchy.
6. Jira creates parent but rejects one or more children.
7. Template version changes between draft and submit.

## Non-goals

- editing live Jira issues from this dashboard
- becoming a generic Jira replacement
- syncing current Jira state back into history as truth

## Implementation bias

Prefer:
- explicit provenance
- append-only audit history
- deterministic template versioning
- capability discovery over assumptions

Avoid:
- hidden mutation
- implicit provider behavior
- treating Jira as eventually optional
