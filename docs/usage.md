# Usage

## Recommended flow

1. Initialize state:
   - `python scripts/bootstrap_workflow_state.py`

2. Paste the contents of:
   - `.github/copilot/workflow-prompt.md`
   into Copilot Agent mode

3. Let the agent operate step-by-step

4. After failure or interruption:
   - rerun Copilot Agent with the same workflow prompt
   - it should read the existing state file and resume

## Files

### `copilot-instructions.md`
Persistent operating rules for Copilot in the repo.

### `workflow-prompt.md`
Task-specific orchestration prompt to run the Jira workflow.

### `jira-webapp-workflow-state.json`
Machine-readable checkpoint file.

### `jira-webapp-workflow-log.md`
Human-readable log of what happened.

## What this solves

- prevents vague “continue from previous failure” behavior
- forces checkpointing
- forces explicit failure recording
- creates an audit trail

## What it does not solve

- external side effects already performed in Jira
- poor subagent decomposition
- weak verification logic
- missing secrets, credentials, or environment setup
