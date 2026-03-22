# Remaining Open Questions

Most of the core product decisions are now fixed. These are the unresolved points that still materially affect implementation.

## 1. SSO details
- Which IdP is the company using: Azure AD / Okta / Google Workspace / other?
- Do you want team membership sourced from the IdP, your own DB, or both?

## 2. Jira specifics
- Jira Cloud or Jira Data Center?
- Should Feature/Story parent references use standard Jira parent fields or custom linkage in your instance?
- Do target start/end dates map to standard fields or custom fields?

## 3. Template governance
- Who can publish a template as public?
- Are public templates reusable only, or forkable into team-owned copies?
- Do templates need approval workflow, or direct publishing is acceptable internally?

## 4. File ingestion constraints
- Maximum file size per upload and per request?
- Retention policy for source files?
- Do images need OCR/caption extraction on day 1 or later?

## 5. Submission behavior
- On partial Jira submission failure, should the app:
  - stop immediately,
  - continue and mark mixed result,
  - or retry asynchronously?
- Should successful parents remain created if children fail, or should the worker attempt compensating rollback where possible?

## 6. Provider execution
- Will there be one server-side provider initially, or a registry of providers from day 1?
- Do you need deterministic generation mode for the same template/input combination?

## 7. Deployment
- Preferred hosting stack?
- Postgres / SQL Server / other?
- Object storage choice?
