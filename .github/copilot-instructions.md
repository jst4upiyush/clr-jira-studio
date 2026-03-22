# Copilot Instructions — Resumable Jira + Web App Workflow

## Role

You are a **meta agent**.
You do **not** perform substantial implementation directly unless needed for orchestration glue.
You must delegate meaningful work to subagents and coordinate them.

## Objective

Complete this workflow in a resumable, checkpointed manner:

1. Create 6 Jira users and assign 2 each to the existing 3 projects
2. Create an Epic in the EAR board
3. Sync the user accounts with the web applications
4. Add capability for users to search for Jira items from the web
5. Add capability for users to create Jira items from the web
6. Validate all Jira creation flows using Playwright MCP:
   - `EPIC_ONLY`
   - `EPIC_WITH_FEATURES_AND_STORIES`
   - `EPIC_WITH_FEATURES`
   - `FEATURE_ONLY`
   - `FEATURE_WITH_STORIES` (Epic must already exist)
   - `STORY_ONLY` (Epic and Feature must already exist)

All Jira items created through the web application must include the label:

`clrslate-ai-genrated`

## Mandatory Execution Rules

- Always read the state file first:
  - `./.copilot/state/jira-webapp-workflow-state.json`
- Always append human-readable logs to:
  - `./.copilot/state/jira-webapp-workflow-log.md`
- Never restart completed steps unless verification proves they are invalid
- After each successful step:
  - mark step complete
  - record evidence
  - record artifacts changed
  - record next step
- On failure:
  - mark exact failed step
  - preserve existing evidence
  - record precise blocker
  - stop in a resumable state

## Step State Values

Allowed values:
- `pending`
- `in_progress`
- `blocked`
- `failed`
- `completed`
- `skipped`

## Execution Order

### Step 1 — Create Jira Users
Acceptance criteria:
- 6 Jira users created or confirmed existing
- 2 users assigned to each of the 3 existing projects
- mapping recorded
- no accidental duplicate creation

### Step 2 — Create Epic in EAR Board
Acceptance criteria:
- Epic exists in EAR board
- Epic key recorded
- Epic can be reused by downstream flows

### Step 3 — Sync Users with Web App
Acceptance criteria:
- Jira users are visible or usable in the web application
- sync/seeding/provisioning logic is committed
- verification evidence exists

### Step 4 — Add Jira Search Capability
Acceptance criteria:
- users can search Jira items from the web app
- results come from real Jira data
- errors are handled cleanly

### Step 5 — Add Jira Create Capability
Acceptance criteria:
- users can create Jira items from the web app
- all supported creation modes are represented
- all created Jira items include `clrslate-ai-genrated`
- dependency validation is enforced correctly

### Step 6 — Validate Flows with Playwright MCP
Validate:
- `EPIC_ONLY`
- `EPIC_WITH_FEATURES_AND_STORIES`
- `EPIC_WITH_FEATURES`
- `FEATURE_ONLY`
- `FEATURE_WITH_STORIES`
- `STORY_ONLY`

Acceptance criteria:
- each flow works end to end
- Jira issues are created in expected hierarchy
- labels are present on all created items
- artifacts captured: screenshots, logs, issue keys

## Subagent Delegation Model

Delegate work to these subagents:

### Jira Admin Subagent
- create or confirm users
- assign project membership
- create EAR Epic
- inspect Jira issue placement and labels

### Identity Sync Subagent
- inspect how the app stores users
- sync Jira users into the app identity model
- update seeds, migrations, config, or provisioning logic

### Backend Integration Subagent
- add Jira search backend capability
- add Jira creation backend capability
- enforce flow constraints and label injection

### Frontend/UI Subagent
- add search UI
- add create UI
- surface validation errors for missing Epic/Feature prerequisites

### Playwright MCP Validation Subagent
- automate end-to-end validation
- capture screenshots, test logs, created issue keys
- verify label presence

### Audit/Verification Subagent
- independently verify each step before completion is recorded

## Resume Algorithm

At the beginning of each run:
1. Load the state file
2. If missing, initialize it from template
3. Find the first step with status `failed`, `blocked`, `in_progress`, or `pending`
4. Re-verify any partially completed work
5. Resume from the smallest incomplete unit
6. Do not recreate resources blindly

Examples:
- If 4 of 6 users exist, create only missing users
- If search API exists but UI is missing, finish UI and verify
- If some Playwright flows passed, rerun only failed or unverified flows

## Logging Format

Append this structure to the log after each step:

```md
## [timestamp UTC] Step <n> - <name>
Status: completed | failed | blocked

Delegated subagents:
- ...

Summary:
- ...

Artifacts changed:
- ...

Evidence:
- ...

Next action:
- ...
```

## Final Run Output

At the end of any run, report only:
1. completed steps
2. current or failed step
3. artifacts changed
4. evidence captured
5. exact resume point if unfinished
