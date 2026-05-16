# Phase 4 Stage B — Letters / Correspondence / Circulars / Advisory

> **Status:** Complete. `npx tsc --noEmit` is clean.
> **Owner:** Stage B agent (resource families: SAMA letters, correspondence,
> circulars, advisory).

## 1. Files created

### Schemas (Zod) — `src/lib/api/schemas/*`
- `letters.ts`
- `correspondence.ts`
- `circulars.ts`
- `advisory.ts`

### Service helpers — `src/lib/api/services/*`
- `letters.ts` — reference-number generator (per authority × type × year), approval-step state machine, placeholder render (server clone of `src/lib/letter-placeholders.ts`), timeline insert, response-deadline computation.
- `correspondence.ts` — column lists, `COR-NNNNN` reference generator, existence guard.
- `circulars.ts` — column lists, `<AUTH>-CIR-YYYY-NNNN` reference generator, timeline insert.
- `advisory.ts` — column lists, `ADV-NNNN` reference generator, existence guard.

### Cache tag factories — `src/lib/api/cache.ts` (extended in-place)
Added: `circularImplementations`, `circularTimeline`, `samaLetterAttachments`, `samaLetterTimeline`, `samaLetterPlaceholders`, `samaLetterTemplates`, `letterTypes`, `letterSubCategories`, `authorityDepartments`, `correspondenceAttachments`, `correspondenceTypes`.

### Route handlers (38 files)

**SAMA letters (16)**
- `letters/route.ts` — GET/POST
- `letters/[letterId]/route.ts` — GET/PATCH/DELETE
- `letters/[letterId]/submit-for-approval/route.ts` — POST
- `letters/[letterId]/approve-step/route.ts` — POST
- `letters/[letterId]/reject-step/route.ts` — POST
- `letters/[letterId]/send/route.ts` — POST
- `letters/[letterId]/mark-response-received/route.ts` — POST
- `letters/[letterId]/archive/route.ts` — POST
- `letters/[letterId]/unarchive/route.ts` — POST
- `letters/[letterId]/attachments/route.ts` — GET/POST
- `letters/[letterId]/attachments/[attachmentId]/route.ts` — DELETE
- `letters/[letterId]/timeline/route.ts` — GET
- `letters/[letterId]/placeholders/route.ts` — GET/PATCH

**Letter lookups (6)**
- `letter-templates/route.ts` — GET/POST
- `letter-templates/[templateId]/route.ts` — PATCH/DELETE
- `letter-types/route.ts` — GET/POST
- `letter-types/[typeId]/route.ts` — PATCH/DELETE
- `letter-sub-categories/route.ts` — GET/POST  *(filters by `framework_id`)*
- `letter-sub-categories/[subCategoryId]/route.ts` — PATCH/DELETE
- `authority-departments/route.ts` — GET/POST  *(filters by `authority_id`)*
- `authority-departments/[departmentId]/route.ts` — PATCH/DELETE

**Correspondence (7)**
- `correspondence/route.ts` — GET/POST
- `correspondence/[correspondenceId]/route.ts` — GET/PATCH/DELETE
- `correspondence/[correspondenceId]/archive/route.ts` — POST
- `correspondence/[correspondenceId]/unarchive/route.ts` — POST
- `correspondence/[correspondenceId]/attachments/route.ts` — GET/POST
- `correspondence/[correspondenceId]/attachments/[attachmentId]/route.ts` — DELETE
- `correspondence-types/route.ts` — GET/POST
- `correspondence-types/[typeId]/route.ts` — PATCH/DELETE

**Advisory (2)**
- `advisory/route.ts` — GET/POST
- `advisory/[advisoryId]/route.ts` — GET/PATCH/DELETE

**Circulars (7)**
- `circulars/route.ts` — GET/POST
- `circulars/[circularId]/route.ts` — GET/PATCH/DELETE
- `circulars/[circularId]/workflow/advance/route.ts` — POST
- `circulars/[circularId]/workflow/set-phase-deadline/route.ts` — POST
- `circulars/[circularId]/implementations/route.ts` — GET/POST
- `circulars/[circularId]/implementations/[implementationId]/route.ts` — PATCH/DELETE
- `circulars/[circularId]/timeline/route.ts` — GET

## 2. Endpoint count

| Resource family | Routes | Method-endpoints |
|---|---:|---:|
| SAMA letters (incl. lookups) | 22 | ~36 |
| Correspondence | 9 | 13 |
| Advisory | 2 | 5 |
| Circulars | 7 | 12 |
| **Total** | **40** | **~66** |

(`Method-endpoints` counts each verb separately on routes that export multiple.)

## 3. Permission mapping (deviations from spec keys)

The seeded permission set in migration 018 only contains generic
`create`/`edit`/`delete` + the audit/observation/report/settings/team families.
**There are no `sama:*`, `correspondence:*`, `circular:*`, or `advisory:*`
keys seeded.** Per BACKEND-API-MAP §3.3 the canonical mapping is:

- Letters CRUD, transitions, approve/reject steps → `create` / `edit` / `delete`. "Approve SAMA Letters" maps to `edit`.
- Letter templates / letter-types / sub-categories / authority-departments → `settings:edit`.
- Correspondence CRUD → `create` / `edit` / `delete`; types CRUD → `settings:edit`.
- Advisory CRUD → `create` / `edit` / `delete`.
- Circulars CRUD + workflow → `create` / `edit` / `delete`.

This matches the seeded matrix and BACKEND-API-MAP §3.2 (where the per-resource
keys collapse to the generic verb for resources outside the audits/observations
families).

## 4. Reference-number generation

Server-side, in `services/letters.ts` / `services/correspondence.ts` /
`services/circulars.ts` / `services/advisory.ts`:

- Format: `<AUTHORITY>-<TYPE_PREFIX>-<YYYY>-<NNNN>` (letters), `<AUTHORITY>-CIR-<YYYY>-<NNNN>` (circulars), `COR-<NNNNN>` (correspondence), `ADV-<NNNN>` (advisory).
- Implementation: `SELECT MAX(reference)` (filtered by `ILIKE <prefix>%`), increment, retry the INSERT up to 3 times on `unique_violation` (Postgres code `23505`). No `reference_sequences` table exists in the current schema — `SELECT … FOR UPDATE` on such a table would be more efficient if added later.
- Letter type → prefix mapping: `non-objection → NOB`, `inquiry → INQ`, `submission → SUB`, `notification → NOT` (matches `useSAMALetterStore.getNextReference()`).

## 5. Approval-step state machine (letters)

- `submit-for-approval`: `draft → pending-approval`. Computes `response_deadline = now + RESPONSE_DAYS[type]` (non-objection=30, inquiry=21, submission=45, notification=10).
- `approve-step`: requires `step_index` matches the first pending row. On last step approval → letter status `approved`.
- `reject-step`: requires `step_index` matches first pending row. Resets all earlier-step rows back to `pending` and letter to `draft` so author can revise and re-submit. (The DB enum lacks a dedicated `rejected` state.)
- `send`: `approved → sent`, stamps `sent_date` + recomputes `response_deadline`.
- `mark-response-received`: `sent|overdue → response-received`, stamps `response_received_date`.

## 6. Placeholder rendering

`services/letters.ts#renderTemplate()` is a verbatim server-side clone of
`src/lib/letter-placeholders.ts#renderTemplate()`. The PATCH /placeholders
route calls it on save (informationally — canonical templated body remains
in the DB; rendered preview returned to the caller). Frontend continues to
use the client-side version for live preview.

## 7. Side-effects per mutation

Every mutation:
1. Calls `writeAudit({ action: <resource>.<verb>, … })` (global `audit_logs`).
2. Inserts a row into the per-entity timeline where one exists (`sama_letter_timeline`, `circular_timeline`).
3. Calls `revalidate(cacheTags.<resource>())` + `revalidate(cacheTags.<resource>(id))`.
4. Circulars + letter state transitions additionally call `revalidate(cacheTags.compliance())` (these feed the scoring engine per BACKEND-API-MAP §4).

## 8. Deviations / open TODOs

1. **No `archived` column on `sama_letters`.** The `correspondence` table has one and we use it; the letters table does not. `letters/[id]/archive`/`unarchive` exist for API parity but only emit an audit + timeline event — they don't filter list queries. The `?archived=` query parameter on `GET /api/letters` is accepted but is a no-op. A future migration could add the column.

2. **No `circular_implementations` table.** "Implementations" are mapped to `circular_articles` (which is the schema's canonical name for the same concept per migration 007). Endpoint shape preserved; consumers should expect `circular_articles` columns.

3. **No `advisory_attachments` table.** The original prompt mentioned advisory may have attachments; current schema only has `advisory_requests` + `advisory_notes`. Attachment endpoints are **not** implemented. Notes are returned inline on `GET /api/advisory/[id]` from `advisory_notes`. Notes CRUD endpoints (`/notes`) are **not** implemented in this stage — defer to a follow-up if needed; the surface BACKEND-API-MAP §4.11 only calls for "CRUD + notes + status".

4. **`circular_pending_edits` workflow** (BACKEND-API-MAP §4.8 article-level checklists, pending-edit approve/reject, CAP/remediation attachments, `pdf-url` data-URL store) is **not** implemented in this stage. Only the high-level workflow advance + phase-deadline + implementations CRUD are. Stage C / a follow-up should layer those on (the existing tables — `circular_pending_edits`, `circular_cap_attachments`, `circular_remediation_attachments`, `article_checklist_items`, `article_attachments` — are ready in the schema).

5. **`circular_workflow_steps.phase` deadline storage** is on the parent `circulars` row (cap_due_date / cap_deadline / remediation_deadline) rather than on the step rows themselves. The `set-phase-deadline` route documents this mapping inline.

6. **`sama_letter_observations` write paths** (linking letters to observations) are **not** implemented as their own endpoint in this stage — the junction is read inline on `GET /api/letters/[id]`. Add `POST/DELETE /api/letters/[id]/observations/[obsId]` if/when the frontend needs it.

7. **Letter approval-step seeding.** On `POST /api/letters` we don't auto-seed the 3 `sama_letter_approval_steps` rows. The frontend was creating them via the existing store path; once it migrates to API the seeding should happen either here or via a DB trigger. Currently `approve-step` will return `Conflict('No approval steps configured')` if the steps don't exist. Add seeding to `POST /api/letters` in a follow-up.

8. **Permission keys.** All routes use the generic `create`/`edit`/`delete` keys per the seeded matrix. If product wants per-resource keys (e.g. `sama:approve`, `correspondence:archive`) a migration must seed them and the routes can be rewritten with `requirePerm('sama:approve')` etc. — currently this just maps to `edit`.

9. **`has_attachments` filter** uses a two-query approach (fetch all attachment FKs, then `in`/`not in`). Fine for small datasets; should be replaced with an `EXISTS` sub-select via PostgREST RPC if it becomes a hot path.

10. **Template `usage_count`** is bumped non-atomically (read + increment + write) on `POST /api/letters` when `template_id` is supplied. Use a Postgres function (`increment_template_usage_count(template_id uuid)`) if exact counts under contention are needed.

## 9. Cross-agent collisions

While I was writing the family, another Stage B agent extended `src/lib/api/cache.ts` with additional tag factories for the system-lookup / framework-config / global-audit-log families. My additions (`circularImplementations`, `circularTimeline`, `samaLetterAttachments`, `samaLetterTimeline`, `samaLetterPlaceholders`, `samaLetterTemplates`, `letterTypes`, `letterSubCategories`, `authorityDepartments`, `correspondenceAttachments`, `correspondenceTypes`) are still in place and do not conflict with the other agent's additions. No source files outside my owned resources were modified.
