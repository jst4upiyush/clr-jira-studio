# API Outline

## GET /api/auth/session
Return current user and auth mode.

## GET /api/projects
Return visible Jira projects with effective creation capabilities.

## GET /api/templates
Return templates visible to the current user.

## POST /api/templates
Create a draft template.

## POST /api/ingestion/upload
Upload source files for a generation request.

## POST /api/work-items/drafts
Create a mutable draft work-item hierarchy.

## POST /api/work-items/drafts/:draftId/accept
Accept a draft. Final implementation should:
1. create immutable accepted snapshot
2. write to Jira
3. persist Jira keys
4. publish audit event

## GET /api/work-items/history
Return immutable creation history.
