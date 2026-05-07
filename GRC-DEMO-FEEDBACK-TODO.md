# GRC Demo Feedback — TODO

Feedback captured from the most recent demo of the ComplianceOS platform. This document translates the raw feedback into actionable work items grouped by area, with pointers to the most likely files a follow-up session should start from. It is intentionally kept at an intent level — no deep technical prescription — so the next session has room to make implementation calls.

---

## 1. Compliance Health — Department-Level View

**Goal:** The current "overall compliance" score reflects *team performance*, not *business compliance*. These two concepts must be clearly separated in the product.

**What to build:**
- A dedicated tab (on the reports / compliance review page) that shows compliance health **per department**, with charts.
- The per-department view is driven by a **checklist derived from the rules themselves**.
- The compliance officer evaluates each rule against the intended department and marks whether the department is compliant. The score for that department is derived from the officer's evaluations.
- Keep the existing team-performance metric, but label and surface it separately so the two are not conflated.

**Also in this sprint:**
- Rename the **Audit Management / Reports page** to **"Compliance Review"**.

**Starting points:**
- Reports page: `src/app/(dashboard)/reports/page.tsx` and the tab routes under `src/app/(dashboard)/reports/(tabs)/` (especially `executive/` and `audits/`).
- Compliance scoring: `src/lib/compliance-engine.ts` + `compliance-engine.types.ts` and the hook `src/hooks/useComplianceScore.ts`.
- Rules + departments: `src/stores/policy-store.ts` (rules live near policies), `src/stores/department-store.ts`.
- Sidebar/nav label: search for the current "Reports" / "Audit Management" label and update to "Compliance Review".

---

## 2. Risk Mitigation Workflow — Officer-Driven, With Deadlines

**Goal:** Every risk must be a workflow that the compliance officer drives against a specific department, with a hard mitigation deadline.

**Workflow the product should support:**
1. Compliance officer creates a risk and assigns it to an **intended department** (required field).
2. Officer sets a **mitigation deadline** — the date by which the department must have mitigated the risk.
3. Officer compiles a **checklist** of items the department needs to complete (the officer's evaluation criteria).
4. Risk is "sent" to the department.
5. Department proposes a **mitigation plan** (with its own checklist items).
6. The officer **manually marks** each checklist item as done / not done — the officer controls the evaluation.
7. Alongside the existing risk review, the deadline and mitigation status are first-class on the risk record.

**Starting points:**
- `src/stores/risk-store.ts` and the Risk type in `src/types/index.ts`.
- Risks page under `src/app/(dashboard)/reports/(tabs)/risks/`.
- Reuse department selection from `src/stores/department-store.ts`.

---

## 3. Editable Dropdowns Everywhere

**Goal:** Every dropdown that selects a department or category should support **+ Add / Edit / Delete** inline, so the user can adapt it if something is missing from the standard set or if they want extras.

**What to build:**
- A reusable "editable dropdown" pattern: pick from a list, or add a new entry, or edit/delete existing entries (with sensible guards on defaults).
- Apply to department pickers, category pickers, and the other taxonomy dropdowns across the app.

**Starting points:**
- Department dropdown is already centrally sourced from `src/stores/department-store.ts` — extend that pattern (CRUD already exists there) to the UI call sites.
- Likely call sites: risk creation, policy/rule creation, observation creation, SAMA letter template creation, correspondence modals, audit templates.

---

## 4. Policy Page — Naming & Ownership

**Goal:** The current "Policy Owner" field is misnamed and wrongly typed as a person.

**Changes:**
- Rename the *person in charge of following up* to **"Policy Leader"**.
- Introduce **"Policy Owner"** (a.k.a. **"Business Owner"**) as the **department** responsible for complying with the policy — not an individual. Use the department store (IT, Finance, HR, etc.).

**Starting points:**
- Types: `Policy` and `PolicyOwner` in `src/types/index.ts`.
- Store: `src/stores/policy-store.ts` (note: persist migration needed if field shape changes).
- UI: policy details / create / edit modals under the policies pages.

---

## 5. Export Policies & Export Rules (CSV)

**Goal:** There is no way to export all policies or all rules. Add export buttons that dump everything with full detail to CSV.

**Starting points:**
- Existing export helpers (e.g. `exportCorrespondenceLocalized`, `exportAdvisoryLocalized`, `exportRequirementsLocalized`, `exportTeamMembersLocalized`) — follow the same convention and add `exportPoliciesLocalized` and `exportRulesLocalized`.
- Wire the buttons into the policies page and the rules page headers.

---

## 6. Remove Permission Gates

**Goal:** No access restrictions on any module for now — **everyone can collaborate on everything**. Strip out "only X can edit" checks from the UI flows.

**Starting points:**
- Audit the app for places that gate actions on permissions / `accessControls` (team store, policy approval flows, SAMA letter approval, settings pages).
- Keep the permission data model in place (harmless), just stop enforcing it in the UI.

---

## 7. Phase Deadlines On Rules & Policies

**Goal:** Some phases / workflow steps on a rule or policy need their own deadline to be tracked meaningfully.

**What to build:**
- Each phase / workflow step can have a **manually entered deadline** (optional per step, but supported on every step).
- Adding or changing a phase deadline must produce an **activity timeline log entry**.
- **Validation:** a phase deadline cannot be later than the overall rule's or policy's deadline.

**Also applies to checklists:**
- Every **checklist item** (anywhere checklists are used — policies, rules, risks, audits) should have an **optional deadline** field.

**Starting points:**
- Policy workflow step type: `PolicyWorkflowStep` in `src/types/index.ts` and `TIER_WORKFLOWS` in `src/stores/policy-store.ts`.
- Activity log already wired in policy store (`PolicyActivityEntry`) — add a new entry type for deadline set/changed.

---

## 8. SAMA Letter Templates — Actually Functional

The template creation flow for SAMA letters is currently not functional. Two big pieces to build:

### 8a. Smart `[ ]` Placeholders
When building a template, the user can insert `[ ]` placeholders and pick what kind of value each one accepts:
- Free text
- A date
- A reference to **any document in the system** — observation, audit, another letter, a rule, a policy, etc.

When someone later composes a letter from that template:
- Each `[ ]` becomes a dropdown / picker matching its configured type.
- For reference types, the picker walks the user through selecting the exact item, and the letter displays both the **reference ID** and the **title** of the selected item. This is so officers don't have to manually look up reference numbers.

### 8b. Recipient Email Memory Per Authority Department
- When the template creator selects a department from an authority, there must be an **email field** next to it where they insert the recipient's email.
- After saving, that email is **remembered against that department** and appears as a dropdown suggestion in every future template — the dropdown is editable (add / edit / delete entries).

### 8c. Authority Department Dropdown Is Editable
- The "department from the authority" dropdown itself must support **add / edit / delete** (same pattern as item #3).

**Starting points:**
- Template store: `src/stores/sama-template-store.ts` (currently being edited).
- Letter store: `src/stores/sama-letter-store.ts`.
- Page: `src/app/(dashboard)/correspondence/sama-letters/page.tsx`.
- Cross-system reference picker will need to read from `observation-store`, `audit-store`, `sama-letter-store`, `policy-store` (rules + policies).

---

## Suggested Ordering

If a single session picks this up, a reasonable order is:

1. **Dropdown-editability pattern** (#3) — unblocks several later items.
2. **Compliance Review rename + per-department compliance tab** (#1).
3. **Policy ownership rename + department-typed owner** (#4).
4. **Phase / checklist deadlines + validation** (#7).
5. **Risk mitigation workflow with deadlines** (#2).
6. **Exports for policies & rules** (#5).
7. **Remove permission gates** (#6).
8. **SAMA letter templates** (#8) — largest piece, best tackled last.
