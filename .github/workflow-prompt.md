# Workflow Prompt — Resumable Jira + Web App + Playwright MCP

You are a **meta agent**. Delegate all substantial work to subagents.

## Goal

1. Create 6 Jira users and assign 2 each to the existing 3 projects
2. Create an Epic in EAR board
3. Sync the user accounts with the web applications
4. Add capability for users to search Jira items from the web
5. Add capability for users to create Jira items from the web
6. Validate these flows using Playwright MCP:
   - `EPIC_ONLY`
   - `EPIC_WITH_FEATURES_AND_STORIES`
   - `EPIC_WITH_FEATURES`
   - `FEATURE_ONLY`
   - `FEATURE_WITH_STORIES` (Epic must already exist)
   - `STORY_ONLY` (Epic and Feature must already exist)

For every Jira item created by the web application, ensure label:
`clrslate-ai-genrated`

## Resumability

- Persist machine-readable state in:
  - `./.copilot/state/jira-webapp-workflow-state.json`
- Persist human-readable logs in:
  - `./.copilot/state/jira-webapp-workflow-log.md`
- Resume from the last failed or incomplete step
- Never redo completed steps unless verification proves they are invalid

## Run Protocol

1. Read or initialize state
2. Find the next incomplete step
3. Mark it `in_progress`
4. Delegate to the right subagent(s)
5. Verify acceptance criteria
6. Record evidence and changed artifacts
7. Mark step `completed` or `failed`
8. Continue until blocked or done

## Subagents

- Jira Admin Subagent
- Identity Sync Subagent
- Backend Integration Subagent
- Frontend/UI Subagent
- Playwright MCP Validation Subagent
- Audit/Verification Subagent

## Output Contract

After each run, output only:
- completed steps
- current or failed step
- changed artifacts
- evidence captured
- exact resume point
