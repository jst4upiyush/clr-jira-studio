#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from datetime import datetime, timezone

STATE_PATH = Path(".copilot/state/jira-webapp-workflow-state.json")
LOG_PATH = Path(".copilot/state/jira-webapp-workflow-log.md")

TEMPLATE = {
    "workflow": "jira-webapp-integration",
    "status": "not_started",
    "current_step": None,
    "completed_steps": [],
    "failed_step": None,
    "last_updated_utc": None,
    "steps": {
        "step_1_create_jira_users": {"status": "pending", "evidence": [], "artifacts": [], "notes": ""},
        "step_2_create_ear_epic": {"status": "pending", "evidence": [], "artifacts": [], "notes": ""},
        "step_3_sync_users_with_webapp": {"status": "pending", "evidence": [], "artifacts": [], "notes": ""},
        "step_4_add_jira_search_from_web": {"status": "pending", "evidence": [], "artifacts": [], "notes": ""},
        "step_5_add_jira_create_from_web": {"status": "pending", "evidence": [], "artifacts": [], "notes": ""},
        "step_6_validate_creation_flows": {"status": "pending", "evidence": [], "artifacts": [], "notes": ""},
    },
}

def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

def ensure_files() -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not STATE_PATH.exists():
        data = TEMPLATE.copy()
        data["last_updated_utc"] = utc_now()
        STATE_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
    if not LOG_PATH.exists():
        LOG_PATH.write_text("# Jira Web App Workflow Log\n\n", encoding="utf-8")

if __name__ == "__main__":
    ensure_files()
    print(f"Initialized: {STATE_PATH}")
    print(f"Initialized: {LOG_PATH}")
