# Stage B — Observations / Risks / Policies (and lookups)

> **Agent:** Observations + Risks + Policies family.
> **Reference pattern:** `.planning/07-api-pattern.md` (audits family).
> **TypeScript status:** `npx tsc --noEmit` is clean for all files in this agent's scope. One pre-existing error in `src/lib/api/services/letters.ts` (different agent — `'??' and '||' operations cannot be mixed without parentheses` at line 47) is out of scope.

---

## Files created

### Zod schemas (3)
- `src/lib/api/schemas/observations.ts`
- `src/lib/api/schemas/risks.ts`
- `src/lib/api/schemas/policies.ts`

### Service helpers (3)
- `src/lib/api/services/observations.ts` (column lists, `assertObservationExists`, `getObservationDetail`, `writeObservationTimeline`)
- `src/lib/api/services/risks.ts` (column lists, `assertRiskExists`, `getRiskDetail`, `assertWorkflowTransition`, `writeRiskHistory`)
- `src/lib/api/services/policies.ts` (column lists, `assertPolicyExists`, `getPolicyDetail`, `writePolicyActivity`)

### Route handlers (37 files)

Observations (15 files):
- `src/app/api/observations/route.ts` — GET list, POST create
- `src/app/api/observations/[observationId]/route.ts` — GET detail, PATCH, DELETE
- `src/app/api/observations/[observationId]/assign/route.ts` — POST leader+assignees
- `src/app/api/observations/[observationId]/close/route.ts` — POST close
- `src/app/api/observations/[observationId]/reopen/route.ts` — POST reopen
- `src/app/api/observations/[observationId]/checklist/route.ts` — GET / POST
- `src/app/api/observations/[observationId]/checklist/[itemId]/route.ts` — PATCH / DELETE
- `src/app/api/observations/[observationId]/evidence/route.ts` — GET / POST
- `src/app/api/observations/[observationId]/evidence/[evidenceId]/route.ts` — DELETE
- `src/app/api/observations/[observationId]/attachments/route.ts` — GET / POST (mirror of evidence)
- `src/app/api/observations/[observationId]/attachments/[attachmentId]/route.ts` — DELETE
- `src/app/api/observations/[observationId]/remediation/route.ts` — GET / POST
- `src/app/api/observations/[observationId]/remediation/[planId]/toggle/[itemId]/route.ts` — PATCH (toggle checklist item)
- `src/app/api/observations/[observationId]/timeline/route.ts` — GET (read-only)
- `src/app/api/observations/[observationId]/comments/route.ts` — POST

Risks (9 files):
- `src/app/api/risks/route.ts` — GET list, POST create
- `src/app/api/risks/[riskId]/route.ts` — GET detail, PATCH, DELETE
- `src/app/api/risks/[riskId]/assign-department/route.ts` — POST
- `src/app/api/risks/[riskId]/set-deadline/route.ts` — POST
- `src/app/api/risks/[riskId]/send-to-department/route.ts` — POST workflow transition
- `src/app/api/risks/[riskId]/submit-plan/route.ts` — POST workflow transition
- `src/app/api/risks/[riskId]/accept-plan/route.ts` — POST workflow transition
- `src/app/api/risks/[riskId]/plan/[planId]/toggle/[itemId]/route.ts` — PATCH (auto-resolves risk when all items done)
- `src/app/api/risks/[riskId]/history/route.ts` — GET (read-only)

Risk categories (2 files):
- `src/app/api/risk-categories/route.ts` — GET / POST
- `src/app/api/risk-categories/[categoryId]/route.ts` — PATCH / DELETE

Policies (7 files):
- `src/app/api/policies/route.ts` — GET list, POST create
- `src/app/api/policies/[policyId]/route.ts` — GET detail, PATCH, DELETE
- `src/app/api/policies/[policyId]/versions/route.ts` — GET / POST
- `src/app/api/policies/[policyId]/workflow/route.ts` — GET steps
- `src/app/api/policies/[policyId]/workflow/advance/route.ts` — POST (submit / approve / undo / initiate-review)
- `src/app/api/policies/[policyId]/workflow/set-phase-deadline/route.ts` — POST
- `src/app/api/policies/[policyId]/activity/route.ts` — GET (read-only)

Policy templates (2 files):
- `src/app/api/policy-templates/route.ts` — GET / POST
- `src/app/api/policy-templates/[templateId]/route.ts` — PATCH / DELETE

Policy categories (2 files):
- `src/app/api/policy-categories/route.ts` — GET / POST
- `src/app/api/policy-categories/[categoryId]/route.ts` — PATCH / DELETE

**Total: 37 route.ts + 6 lib files = 43 files.**

---

## Deviations from the spec

### Schema deviations the migration forced

The migration `008_audits_observations.sql`, `009_risks.sql`, `007_policies_circulars.sql` use slightly different table names than the spec in the brief:

| Spec name | Actual table |
|---|---|
| `observation_checklists` | `observation_checklist` (singular) |
| `observation_evidence` | not present — folded into `observation_documents` |
| `observation_attachments` | not present — folded into `observation_documents` |
| `observation_remediation_plans` | `remediation_plans` |
| `capa` | not present — folded into `remediation_plans` |
| `risk_workflow_state` | not present — state lives on `risks.mitigation_workflow_status` |
| `risk_mitigation_plans` | `risk_department_proposed_plan` (1:1 with risks) |
| `policy_review_schedules` | `policy_review_cycles` |

Both `/evidence` and `/attachments` endpoints exist (per the spec) but both write into `observation_documents`. The frontend's evidence-vs-attachment distinction is preserved only in the audit-log `action` key (`observation.evidence.add` vs `observation.attachment.add`) and the timeline `action_type`. Recommended migration follow-up: add a `kind` column on `observation_documents` to disambiguate, or split into two tables.

For the risk `plan/[planId]/toggle/[itemId]` endpoint: the schema has only one proposed-plan row per risk (PK is `risk_id`), so the route accepts `planId` for spec parity but does not enforce a join. The checklist toggle reads `risk_mitigation_checklist` directly, and when all items become `completed = true` the handler sets `risks.status = 'resolved'` and `mitigation_workflow_status = 'resolved'`.

### Permission gating

The seeded RBAC matrix (`migration 018_seed_data.sql`) has no `risk:*` or `policy:*` keys. Per the same precedent set in the audits-template reference (`templates:manage:audits` → `settings:edit`), we mapped:

- **Risks** — `audit:edit` (CRUD + workflow) / `audit:delete` (delete). These keys are granted to compliance_officer + org_admin (delete: org_admin only), matching BACKEND-API-MAP §4.6.
- **Policies CRUD** — generic `create` / `edit` / `delete` keys (compliance_officer + org_admin, delete: org_admin only).
- **Policy workflow** (`/workflow/advance`) — `settings:edit` (org_admin only), per the spec's "Approve Policy Reviews" gating.
- **Policy templates + categories + risk categories** — `settings:edit` (org_admin only).
- **Observations** — `observation:create` / `observation:edit` / `observation:delete` / `observation:comment` (all seeded).

Adding `risk:*` / `policy:*` permission keys to migration 018 is the recommended follow-up — the route handlers will continue to work without code changes because the keys we use are supersets.

### audit_id filter on observations list

Per the brief, `GET /api/observations?audit_id=` should be supported. The current schema has no direct FK between `observations` and `audits` (the link goes via `sama_letter_observations` only — same gap noted in `07-api-pattern.md` §7.2). The query parameter is accepted but not applied; this is a no-op until a junction table or denormalized column exists. Recommended: add `observations.audit_id` column referencing `audits(id)`.

### department_id filter on observations list

`observations.department` is a free-text label, not an FK. The handler resolves `?department_id=<uuid>` by reading `departments.key` + `departments.name_en` and filtering `observations.department IN (key, name_en)`. Recommended: replace `observations.department` (text) with `observations.department_id` (uuid FK).

### Comments

Per BACKEND-API-MAP §4.5, observation comments live in `observation_updates`. The spec also calls for `PATCH /[cid]` and `DELETE /[cid]` on comments — those were not in the brief's endpoint list, so they were not implemented. Add later if needed.

### Risk checklist (top-level) CRUD

Schemas exist (`CreateRiskChecklistItemSchema`, `UpdateRiskChecklistItemSchema` in `schemas/risks.ts`) but standalone routes (`POST /api/risks/[id]/checklist`, `PATCH /api/risks/[id]/checklist/[iid]`, `DELETE /api/risks/[id]/checklist/[iid]`) were not in the brief's endpoint list. The `plan/[planId]/toggle/[itemId]` endpoint covers the toggle path required by the spec. Standalone CRUD on `risk_mitigation_checklist` can be added trivially if needed.

### `closure-reviews` endpoint not implemented

BACKEND-API-MAP §4.5 mentions `PATCH /api/observations/:id/closure/review` (gated `manager+`). The brief consolidated this to `/close` + `/reopen`. The schema in `schemas/observations.ts` exposes a `ReviewRemediationPlanSchema` for the analogous remediation case; closure_reviews can be wired in later if needed.

### `risks` department_id filter ambiguity

The brief lists both `department_id` and `intended_department_id` as list filters. Risks have only `intended_department_id` in the schema. The handler treats `department_id` as an alias for `intended_department_id`.

---

## Open TODOs (for a follow-up migration / agent)

1. Add `risk:*` (`risk:view`, `risk:create`, `risk:edit`, `risk:delete`, `risk:assess`) and `policy:*` (`policy:view`, `policy:create`, `policy:edit`, `policy:delete`, `policy:approve`) keys to `permissions` + `role_permissions` in a new migration. Update the route handlers to use them once seeded.
2. Add `observations.audit_id` FK column so the list filter can return real results.
3. Replace `observations.department` (text) with `observations.department_id` (uuid FK).
4. Add a `kind` column on `observation_documents` to distinguish evidence vs attachment.
5. Decide whether `closure_reviews` needs an API endpoint or whether `/close` + `/reopen` are sufficient.
6. Standalone CRUD on `risk_mitigation_checklist` if the frontend ever needs it without a proposed plan.
7. Add `PATCH/DELETE` on observation comments (`observation_updates`) if comment editing is in MVP.
8. Add `policy_attachments` + `policy_evidence` POST/DELETE endpoints (similar to `observation_documents`).
9. `GET /api/policies/review-alerts` (policies due within 90 days) was in BACKEND-API-MAP §4.7 but not in the brief; add if needed.

---

## Caching summary

| Endpoint family | Cache tag | s-maxage | swr |
|---|---|---|---|
| `observations` list | `observations:list` | 60 | 300 |
| `observations/{id}` | `observations:{id}` | 60 | 300 |
| `observations/{id}/{sub}` | `observations:{id}` | 60 | — |
| `observations/{id}/timeline` | `observations:{id}` | 30 | — |
| `risks` list | `risks:list` | 60 | 300 |
| `risks/{id}` | `risks:{id}` | 60 | 300 |
| `risks/{id}/history` | `risks:{id}` | 30 | — |
| `policies` list | `policies:list` | 60 | 300 |
| `policies/{id}` | `policies:{id}` | 60 | 300 |
| `policies/{id}/activity` | `policies:{id}` | 30 | — |
| `policy-templates` | `policy-templates:list` | 300 | 600 |
| `policy-categories` | `policy-categories:list` | 3600 | 7200 |
| `risk-categories` | `risk-categories:list` | 3600 | 7200 |

Every mutation invalidates the list tag + the `{id}` tag. State / score-affecting transitions also invalidate `compliance`.

Note: the `policy-templates`, `policy-categories`, and `risk-categories` tags are *not* in `cacheTags` factories in `src/lib/api/cache.ts` (the shared cache module is owned by Phase 4 — out of scope for Stage B per the brief). The string literals `'policy-templates:list'`, `'policy-categories:list'`, `'risk-categories:list'` are used directly in those route handlers. Add to `cacheTags` when the shared module is next revised.
