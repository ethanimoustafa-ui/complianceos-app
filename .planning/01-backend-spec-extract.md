# Backend Spec Extract — `scripts/generate-backend-spec.ts`

Source of truth extract for the ComplianceOS Supabase backend. Pulled verbatim where useful from the 2172-line .docx generator script.

---

## 0. Top-Level Conventions

- **Top-level tables** include: `id UUID PK`, `tenant_id UUID FK → tenants(id)`, `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ DEFAULT now()`, `deleted_at TIMESTAMPTZ` (soft delete) — unless noted.
- **`tenants` table** omits `tenant_id` and `deleted_at`.
- **Child/junction tables** (timelines, checklists, approval steps, workflow steps, version history, junction rows) intentionally **OMIT** `tenant_id` and inherit tenancy from their parent via FK. They MUST use the parent-join RLS template (Section 3.2.1).
- All FKs to a parent entity use `ON DELETE CASCADE` (except where noted).
- Request/response bodies use **camelCase JSON**. Standard error format: `{ error: string, details?: object }`.
- Pagination: `?page=1&pageSize=20`. Sorting: `?sort=createdAt&dir=desc`. Filtering: `?status=open&severity=critical`.
- All endpoints require `Authorization: Bearer <jwt>` header. All mutations are tenant-scoped via middleware.

### Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Next.js 16 + React 19 + TypeScript 5 | App Router, Tailwind 4, Zustand 5 |
| Backend | Express.js + TypeScript | REST, controller-service-repository |
| Database | Supabase (Postgres 15+) | RLS, realtime, storage |
| Auth | Supabase Auth | JWT with custom claims (`tenant_id`, `role`) |
| Queue | pg-boss | Postgres-native job queue |
| PDF Export | LaTeX (xelatex) | polyglossia for Arabic/RTL, Handlebars templates |
| File Storage | Supabase Storage | Tenant-scoped buckets |
| Hosting | Vercel (frontend) + Cloud Run (API) | |

### Three-Layer API Pattern

`Routes (Express + zod validation + auth) → Controllers (parse/format) → Services (business logic, txns) → Repositories (Supabase client, tenant-scoped)`.

Example flow: `POST /api/audits → authMiddleware → validateBody(createAuditSchema) → AuditController.create → AuditService.create → AuditRepository.insert → 201`.

### Regulatory Frameworks Supported

| ID | Framework | Authority |
|---|---|---|
| `sama` | SAMA BCM & Cyber Framework | Saudi Central Bank |
| `nca-ecc` | NCA Essential Cybersecurity Controls | NCA |
| `ndmo-pdpl` | Personal Data Protection Law | NDMO |
| `nca-cscc` | Cloud Security Controls | NCA |
| `citc` | CITC Telecom Regulations | CITC |
| `nca-ccc` | Critical Infrastructure Controls | NCA |
| `cma` | Capital Market Authority Rules | CMA |
| `zatca` | Tax & Customs | ZATCA |
| `misa` | Investment Authority | MISA |
| `safiu` | Financial Intelligence Unit | SAFIU |
| `sharia-board` | Sharia Compliance | Internal Sharia Board |

---

## 1. Multi-Tenancy & RLS

### JWT Custom Claims
```json
{
  "sub": "user-uuid",
  "email": "user@bank.sa",
  "tenant_id": "tenant-uuid",
  "role": "compliance_officer",
  "permissions": ["audit:view", "audit:create", ...],
  "iat": 1710000000,
  "exp": 1710086400
}
```

### Tenant Middleware (Express)
```ts
export async function tenantMiddleware(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1]
  if (!token) return res.status(401).json({ error: 'Missing token' })
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })
  const tenantId = user.app_metadata?.tenant_id
  if (!tenantId) return res.status(403).json({ error: 'No tenant' })
  // Set RLS context for this request
  await supabase.rpc('set_tenant_context', { tid: tenantId })
  req.tenantId = tenantId
  req.userId = user.id
  req.userRole = user.app_metadata?.role
  next()
}
```

### RLS Template — Top-Level Tables (carry their own `tenant_id`)
```sql
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON audits
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_insert ON audits
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### RLS Template — Child / Junction Tables (parent-join)
Many child tables omit `tenant_id`. The top-level template will fail with `column "tenant_id" does not exist`. Use the parent-join variant:
```sql
-- Example: observation_assignees inherits tenancy from observations
ALTER TABLE observation_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON observation_assignees
  USING (EXISTS (
    SELECT 1 FROM observations o
    WHERE o.id = observation_assignees.observation_id
      AND o.tenant_id = current_setting('app.current_tenant_id')::uuid
  ));

CREATE POLICY tenant_insert ON observation_assignees
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM observations o
    WHERE o.id = observation_assignees.observation_id
      AND o.tenant_id = current_setting('app.current_tenant_id')::uuid
  ));
```

**Tables that MUST use the parent-join template** (parent in parens):
- `observation_assignees`, `observation_checklist`, `observation_timeline`, `closure_requests`, `closure_reviews` (`observations`)
- `risk_mitigation_checklist`, `risk_history` (`risks`)
- `policy_versions`, `policy_workflow_steps`, `policy_activity_log`, `policy_review_cycles` (`policies`)
- `circular_articles`, `circular_workflow_steps`, `circular_timeline`, `circular_versions`, `circular_pending_edits` (`circulars`)
- `sama_letter_approval_steps`, `sama_letter_timeline`, `sama_letter_observations`, `sama_letter_attachments` (`sama_letters`)
- `advisory_notes` (`advisory_requests`)
- `audit_team_members` (`audits`)
- `framework_departments`, `framework_weights` (`frameworks`)
- `team_member_assignments`, `team_member_access_controls` (`users`)
- `employee_course_progress` (`training_courses` + `training_employees`)
- `message_thread_participants` (`message_threads`)

Alternative: denormalize `tenant_id` onto every child + maintain via triggers.

---

## 2. Tables (Full DDL)

### 2.1 `tenants`
```sql
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  domain        TEXT,
  plan          TEXT NOT NULL DEFAULT 'standard',
  logo_url      TEXT,
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

### 2.2 `users`
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN (
                  'org_admin','compliance_officer','auditor','viewer'
                )),
  department    TEXT,
  phone         TEXT,
  avatar_seed   TEXT,
  workload      INTEGER DEFAULT 0,
  permissions   TEXT[] DEFAULT '{}',
  nationality   TEXT,
  status        TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','pending')),
  joined_at     TIMESTAMPTZ DEFAULT now(),
  invited_by    UUID REFERENCES users(id),
  burnout_since TIMESTAMPTZ,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE(tenant_id, email)
);
```

### 2.3 `departments`
```sql
CREATE TABLE departments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  name_ar       TEXT NOT NULL,
  is_default    BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
```

### 2.4 `frameworks` + children
```sql
CREATE TABLE frameworks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  regulatory_body_id      TEXT NOT NULL,
  name                    TEXT NOT NULL,
  name_ar                 TEXT,
  description             TEXT,
  description_ar          TEXT,
  icon                    TEXT,
  icon_color              TEXT,
  enabled                 BOOLEAN DEFAULT true,
  threshold               TEXT DEFAULT 'standard',
  custom_threshold_value  INTEGER,
  alert_on_non_compliance BOOLEAN DEFAULT true,
  version                 TEXT DEFAULT '1.0',
  is_active               BOOLEAN DEFAULT true,
  custom_field_values     JSONB DEFAULT '{}',
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  deleted_at              TIMESTAMPTZ,
  UNIQUE(tenant_id, regulatory_body_id, version)
);

CREATE TABLE framework_departments (
  framework_id  UUID NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (framework_id, department_id)
);

CREATE TABLE framework_weights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id  UUID NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE UNIQUE,
  audits        NUMERIC NOT NULL DEFAULT 15,
  observations  NUMERIC NOT NULL DEFAULT 15,
  letters       NUMERIC NOT NULL DEFAULT 10,
  policies      NUMERIC NOT NULL DEFAULT 15,
  circulars     NUMERIC NOT NULL DEFAULT 15,
  risk_posture  NUMERIC NOT NULL DEFAULT 15,
  training      NUMERIC NOT NULL DEFAULT 15,
  CONSTRAINT weights_sum CHECK (
    audits + observations + letters + policies + circulars + risk_posture + training = 100
  )
);

CREATE TABLE framework_version_migrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  from_framework_id UUID NOT NULL REFERENCES frameworks(id),
  to_framework_id   UUID NOT NULL REFERENCES frameworks(id),
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  migrated_entities JSONB DEFAULT '{}',
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);
```

### 2.5 `audits` + children
```sql
CREATE TABLE audits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  title           TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('internal','sama','sharia')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','completed','overdue')),
  due_date        DATE NOT NULL,
  assignee_id     UUID REFERENCES users(id),
  progress        INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  description     TEXT,
  category        TEXT,
  frequency       TEXT,
  priority        TEXT DEFAULT 'medium',
  closed_overdue  BOOLEAN DEFAULT false,
  completed_at    TIMESTAMPTZ,
  review_schedule JSONB,
  framework_ids   TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE audit_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  audit_id      UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('pdf','image','doc')),
  storage_path  TEXT NOT NULL,
  uploaded_at   TIMESTAMPTZ DEFAULT now(),
  uploaded_by   UUID REFERENCES users(id)
);

CREATE TABLE audit_team_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id  UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id),
  role      TEXT NOT NULL,
  is_owner  BOOLEAN DEFAULT false,
  added_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(audit_id, user_id)
);

CREATE TABLE audit_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  audit_id   UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  author_id  UUID NOT NULL REFERENCES users(id),
  is_edited  BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  audit_id      UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  assignee_id   UUID REFERENCES users(id),
  status        TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending','in_progress','completed','overdue')),
  priority      TEXT DEFAULT 'medium',
  due_date      DATE,
  completed     BOOLEAN DEFAULT false,
  completed_at  TIMESTAMPTZ,
  severity      TEXT,
  framework_ids TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  audit_id    UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  description TEXT,
  user_id     UUID REFERENCES users(id),
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

> Note: `audit_logs` here is a per-audit activity log (scoped to one `audit_id`), distinct from the broader cross-entity `user_activity_logs` (Section 2.13).

### 2.6 `observations` + children
```sql
CREATE TABLE observations (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID NOT NULL REFERENCES tenants(id),
  title                         TEXT NOT NULL,
  sub_title                     TEXT,
  description                   TEXT NOT NULL,
  source                        TEXT NOT NULL CHECK (source IN ('sama','internal','sharia')),
  severity                      TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status                        TEXT NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open','in_progress','resolved','closed')),
  due_date                      DATE NOT NULL,
  remediation_submission_due    DATE,
  department                    TEXT,
  reference                     TEXT NOT NULL,
  progress                      INTEGER DEFAULT 0,
  creator_id                    UUID REFERENCES users(id),
  leader_id                     UUID REFERENCES users(id),
  framework_ids                 TEXT[] DEFAULT '{}',
  created_at                    TIMESTAMPTZ DEFAULT now(),
  updated_at                    TIMESTAMPTZ DEFAULT now(),
  deleted_at                    TIMESTAMPTZ
);

CREATE TABLE observation_assignees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id  UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id),
  name            TEXT NOT NULL,
  role            TEXT,
  UNIQUE(observation_id, user_id)
);

CREATE TABLE observation_checklist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id  UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  text            TEXT NOT NULL,
  completed       BOOLEAN DEFAULT false,
  sort_order      INTEGER DEFAULT 0
);

CREATE TABLE observation_updates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  observation_id  UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES users(id),
  text            TEXT NOT NULL,
  is_edited       BOOLEAN DEFAULT false,
  edited_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE observation_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  observation_id  UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('pdf','image','doc')),
  storage_path    TEXT NOT NULL,
  uploaded_at     TIMESTAMPTZ DEFAULT now(),
  uploaded_by     UUID REFERENCES users(id)
);

CREATE TABLE observation_timeline (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id    UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  date              TIMESTAMPTZ NOT NULL DEFAULT now(),
  description       TEXT NOT NULL,
  description_ar    TEXT,
  action_type       TEXT,
  user_id           UUID REFERENCES users(id),
  user_name         TEXT,
  target_id         TEXT,
  metadata          JSONB DEFAULT '{}'
);

CREATE TABLE remediation_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  observation_id  UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  due_date        DATE NOT NULL,
  status          TEXT DEFAULT 'draft'
                    CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at    TIMESTAMPTZ,
  submitted_by    UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES users(id),
  review_notes    TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE closure_requests (
  observation_id    UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by      UUID NOT NULL REFERENCES users(id),
  notes             TEXT,
  PRIMARY KEY (observation_id)
);

CREATE TABLE closure_reviews (
  observation_id    UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  reviewed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by       UUID NOT NULL REFERENCES users(id),
  approved          BOOLEAN NOT NULL,
  notes             TEXT,
  PRIMARY KEY (observation_id)
);
```

### 2.7 `risks` + children
```sql
CREATE TABLE risks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  category              TEXT NOT NULL CHECK (category IN (
                          'operational','financial','compliance','strategic','reputational'
                        )),
  likelihood            INTEGER NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact                INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
  risk_score            INTEGER GENERATED ALWAYS AS (likelihood * impact) STORED,
  status                TEXT NOT NULL DEFAULT 'identified'
                          CHECK (status IN ('identified','mitigating','accepted','resolved')),
  owner_id              UUID REFERENCES users(id),
  mitigation_plan       TEXT,
  mitigation_progress   INTEGER DEFAULT 0,
  monitoring_frequency  TEXT DEFAULT 'quarterly',
  last_review_date      DATE,
  next_review_date      DATE,
  review_schedule       JSONB,
  framework_ids         TEXT[] DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

CREATE TABLE risk_mitigation_checklist (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id   UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
  text      TEXT NOT NULL,
  completed BOOLEAN DEFAULT false
);

CREATE TABLE risk_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id         UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id),
  action          TEXT NOT NULL,
  previous_value  TEXT,
  new_value       TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 2.8 `policies` + children
```sql
CREATE TABLE policies (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  ref_code                  TEXT NOT NULL,
  name                      TEXT NOT NULL,
  description               TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN (
                                'draft','under-review','approved','expired','overdue','requires-review'
                              )),
  category                  TEXT NOT NULL CHECK (category IN (
                              'compliance','it','operations','risk','hr','finance'
                            )),
  version                   TEXT DEFAULT 'v1.0',
  approval_tier             TEXT NOT NULL CHECK (approval_tier IN ('board','management','sharia','agm')),
  owner_id                  UUID REFERENCES users(id),
  owner_name                TEXT,
  owner_department          TEXT,
  last_review_date          DATE,
  next_review_date          DATE,
  review_cycle_days         INTEGER DEFAULT 365,
  approved_date             DATE,
  overdue_count             INTEGER DEFAULT 0,
  last_overdue_date         DATE,
  current_review_cycle_id   TEXT,
  current_review_cycle_label TEXT,
  current_review_cycle_date TIMESTAMPTZ,
  review_schedule           JSONB,
  framework_ids             TEXT[] DEFAULT '{}',
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  deleted_at                TIMESTAMPTZ,
  UNIQUE(tenant_id, ref_code)
);

CREATE TABLE policy_versions (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version   TEXT NOT NULL,
  date      DATE NOT NULL,
  author    TEXT NOT NULL,
  changes   TEXT NOT NULL
);

CREATE TABLE policy_workflow_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id   UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  step        TEXT NOT NULL,
  date        DATE,
  user_name   TEXT,
  status      TEXT NOT NULL CHECK (status IN ('completed','current','pending')),
  description TEXT,
  action_type TEXT,
  note        TEXT,
  step_state  TEXT CHECK (step_state IN (
                'pending-approval','awaiting-response','awaiting-manager'
              )),
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE policy_activity_log (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  date      DATE NOT NULL,
  type      TEXT NOT NULL,
  text_en   TEXT NOT NULL,
  text_ar   TEXT NOT NULL,
  user_name TEXT,
  note      TEXT
);

CREATE TABLE policy_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  policy_id   UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size        BIGINT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by TEXT
);

CREATE TABLE policy_evidence (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  policy_id           UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  storage_path        TEXT NOT NULL,
  uploaded_at         TIMESTAMPTZ DEFAULT now(),
  uploaded_by         TEXT,
  review_cycle_id     TEXT NOT NULL,
  review_cycle_label  TEXT NOT NULL,
  notes               TEXT
);

CREATE TABLE policy_review_cycles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id     UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  initiated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.9 `circulars` + children
```sql
CREATE TABLE circulars (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  reference                 TEXT NOT NULL,
  authority                 TEXT NOT NULL CHECK (authority IN (
                              'SAMA','CMA','IA','ZATCA','MISA','SAFIU'
                            )),
  title                     TEXT NOT NULL,
  priority                  TEXT DEFAULT 'medium' CHECK (priority IN (
                              'critical','high','medium','low'
                            )),
  status                    TEXT DEFAULT 'pending' CHECK (status IN (
                              'pending','in-progress','completed','overdue'
                            )),
  applicability             TEXT DEFAULT 'pending' CHECK (applicability IN (
                              'applicable','not-applicable','pending'
                            )),
  departments               TEXT[] DEFAULT '{}',
  business_owner_department TEXT,
  assigned_to               UUID REFERENCES users(id),
  progress                  INTEGER DEFAULT 0,
  issuance_date             DATE NOT NULL,
  due_date                  DATE NOT NULL,
  cap_status                TEXT DEFAULT 'not-started',
  cap_due_date              DATE,
  cap_deadline              DATE,
  cap_response_deadline     DATE,
  remediation_deadline      DATE,
  description               TEXT,
  pdf_url                   TEXT,
  reference_url             TEXT,
  framework_ids             TEXT[] DEFAULT '{}',
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  deleted_at                TIMESTAMPTZ,
  UNIQUE(tenant_id, reference)
);

CREATE TABLE circular_articles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circular_id             UUID NOT NULL REFERENCES circulars(id) ON DELETE CASCADE,
  article_number          TEXT NOT NULL,
  title                   TEXT NOT NULL,
  description             TEXT,
  risk_level              TEXT DEFAULT 'medium',
  responsible_department  TEXT,
  compliance_status       TEXT DEFAULT 'not-started',
  assigned_to             UUID REFERENCES users(id),
  notes                   TEXT,
  checklist               JSONB DEFAULT '[]',
  attachments             JSONB DEFAULT '[]'
);

CREATE TABLE circular_workflow_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circular_id     UUID NOT NULL REFERENCES circulars(id) ON DELETE CASCADE,
  phase           INTEGER NOT NULL CHECK (phase IN (0,1,2)),
  label           TEXT NOT NULL,
  label_ar        TEXT NOT NULL,
  status          TEXT DEFAULT 'pending',
  date            DATE,
  user_name       TEXT,
  notes           TEXT,
  action_label    TEXT NOT NULL,
  action_label_ar TEXT NOT NULL,
  requires_notes  BOOLEAN DEFAULT false,
  action_type     TEXT NOT NULL,
  sort_order      INTEGER DEFAULT 0
);

CREATE TABLE circular_timeline (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circular_id UUID NOT NULL REFERENCES circulars(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  title_ar    TEXT,
  date        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_name   TEXT,
  status      TEXT DEFAULT 'pending'
);

CREATE TABLE circular_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circular_id   UUID NOT NULL REFERENCES circulars(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  date          DATE NOT NULL,
  author        TEXT NOT NULL,
  changes       TEXT NOT NULL,
  field_changes JSONB DEFAULT '{}',
  approved      BOOLEAN DEFAULT false
);

CREATE TABLE circular_pending_edits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circular_id   UUID NOT NULL REFERENCES circulars(id) ON DELETE CASCADE,
  data          JSONB NOT NULL,
  requested_by  TEXT NOT NULL,
  requested_at  TIMESTAMPTZ DEFAULT now(),
  status        TEXT DEFAULT 'pending',
  field_changes JSONB DEFAULT '{}',
  approvals     JSONB DEFAULT '[]'
);

CREATE TABLE circular_cap_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  circular_id   UUID NOT NULL REFERENCES circulars(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  type          TEXT,
  size          BIGINT,
  uploaded_at   TIMESTAMPTZ DEFAULT now(),
  uploaded_by   TEXT
);
```

### 2.10 `sama_letters` + children
```sql
CREATE TABLE sama_letters (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  reference               TEXT NOT NULL,
  type                    TEXT NOT NULL CHECK (type IN (
                            'non-objection','inquiry','submission','notification'
                          )),
  sub_category            TEXT,
  sama_department         TEXT,
  subject                 TEXT NOT NULL,
  subject_ar              TEXT,
  body                    TEXT NOT NULL,
  body_ar                 TEXT,
  status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                            'draft','pending-approval','approved','sent','response-received','overdue'
                          )),
  priority                TEXT DEFAULT 'standard' CHECK (priority IN ('standard','urgent')),
  created_by              UUID REFERENCES users(id),
  assigned_to             UUID REFERENCES users(id),
  sent_date               TIMESTAMPTZ,
  response_deadline       TIMESTAMPTZ,
  response_received_date  TIMESTAMPTZ,
  recipient_name          TEXT,
  recipient_org           TEXT,
  recipient_city          TEXT,
  recipient_name_ar       TEXT,
  recipient_org_ar        TEXT,
  recipient_city_ar       TEXT,
  signer_name             TEXT,
  signer_title            TEXT,
  signer_name_ar          TEXT,
  signer_title_ar         TEXT,
  signature_image_url     TEXT,
  framework_ids           TEXT[] DEFAULT '{}',
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  deleted_at              TIMESTAMPTZ,
  UNIQUE(tenant_id, reference)
);

CREATE TABLE sama_letter_approval_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id   UUID NOT NULL REFERENCES sama_letters(id) ON DELETE CASCADE,
  step        INTEGER NOT NULL CHECK (step IN (1,2,3)),
  role        TEXT NOT NULL,
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  assigned_to UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  notes       TEXT,
  UNIQUE(letter_id, step)
);

CREATE TABLE sama_letter_timeline (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id UUID NOT NULL REFERENCES sama_letters(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  date      TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_name TEXT,
  status    TEXT DEFAULT 'pending'
);

CREATE TABLE sama_letter_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  letter_id     UUID NOT NULL REFERENCES sama_letters(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  type          TEXT,
  size          BIGINT,
  uploaded_at   TIMESTAMPTZ DEFAULT now(),
  uploaded_by   TEXT
);

CREATE TABLE sama_letter_observations (
  letter_id       UUID NOT NULL REFERENCES sama_letters(id) ON DELETE CASCADE,
  observation_id  UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  PRIMARY KEY (letter_id, observation_id)
);
```

### 2.11 `correspondence` & `advisory_requests`
```sql
CREATE TABLE correspondence (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  reference     TEXT,
  subject       TEXT NOT NULL,
  from_entity   TEXT NOT NULL,
  to_entities   TEXT[] DEFAULT '{}',
  date          TIMESTAMPTZ NOT NULL,
  type          TEXT NOT NULL CHECK (type IN (
                  'sama','cma','internal','external_auditor','sharia_board','vendor','other'
                )),
  status        TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','received')),
  body          TEXT,
  archived      BOOLEAN DEFAULT false,
  assignee      UUID REFERENCES users(id),
  thread_id     TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE correspondence_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  correspondence_id UUID NOT NULL REFERENCES correspondence(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  type              TEXT,
  size              BIGINT,
  uploaded_at       TIMESTAMPTZ DEFAULT now(),
  uploaded_by       TEXT
);

CREATE TABLE advisory_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  ref             TEXT NOT NULL,
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  business_unit   TEXT NOT NULL CHECK (business_unit IN (
                    'corporate_banking','compliance','it','risk_management','finance','operations','hr'
                  )),
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  priority        TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  requested_by    TEXT NOT NULL,
  requested_date  DATE NOT NULL,
  assigned_to     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE(tenant_id, ref)
);

CREATE TABLE advisory_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES advisory_requests(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 2.12 `calendar_events`
```sql
CREATE TABLE calendar_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  title               TEXT NOT NULL,
  type                TEXT NOT NULL CHECK (type IN ('deadline','meeting','submission','review')),
  date                DATE NOT NULL,
  start_time          TIME,
  end_time            TIME,
  attendees           TEXT[] DEFAULT '{}',
  related_entity_id   UUID,
  related_entity_type TEXT,
  reminders           JSONB DEFAULT '[]',
  description         TEXT,
  location            TEXT,
  completed           BOOLEAN DEFAULT false,
  completed_at        TIMESTAMPTZ,
  agency              TEXT,
  severity            TEXT,
  framework_ids       TEXT[] DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
```

### 2.13 Training
```sql
CREATE TABLE training_courses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  due_date          DATE,
  description       TEXT,
  assigned_count    INTEGER DEFAULT 0,
  completed_count   INTEGER DEFAULT 0,
  overdue_count     INTEGER DEFAULT 0,
  in_progress_count INTEGER DEFAULT 0,
  framework_ids     TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE TABLE training_employees (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  user_id           UUID REFERENCES users(id),
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  department        TEXT,
  is_saudi          BOOLEAN DEFAULT false,
  overall_progress  INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE employee_course_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES training_employees(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  status          TEXT DEFAULT 'not_started'
                    CHECK (status IN ('completed','in_progress','not_started','overdue')),
  progress        INTEGER DEFAULT 0,
  score           INTEGER,
  completed_date  DATE,
  due_date        DATE,
  UNIQUE(employee_id, course_id)
);

CREATE TABLE saudization_metrics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) UNIQUE,
  target            NUMERIC NOT NULL,
  actual            NUMERIC NOT NULL,
  total_employees   INTEGER NOT NULL,
  saudi_employees   INTEGER NOT NULL,
  by_department     JSONB DEFAULT '[]',
  last_data_source  TEXT,
  last_updated      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
```

### 2.14 Team & Activity Logs
```sql
CREATE TABLE team_member_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  due_date    DATE,
  progress    INTEGER DEFAULT 0
);

CREATE TABLE team_member_access_controls (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label     TEXT NOT NULL,
  enabled   BOOLEAN DEFAULT false,
  UNIQUE(user_id, label)
);

CREATE TABLE user_activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID REFERENCES users(id),
  user_name   TEXT NOT NULL,
  action      TEXT NOT NULL,
  module      TEXT NOT NULL,
  details     TEXT,
  ip_address  TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 2.15 Messaging
```sql
CREATE TABLE message_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  subject         TEXT,
  is_group        BOOLEAN DEFAULT false,
  avatar_url      TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  last_message    TEXT,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE message_thread_participants (
  thread_id   UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  is_admin    BOOLEAN DEFAULT false,
  unread_count INTEGER DEFAULT 0,
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  thread_id   UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  read        BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 2.16 `notifications`
```sql
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  type        TEXT DEFAULT 'info' CHECK (type IN ('info','warning','success','error')),
  source_type TEXT,
  route       TEXT,
  entity_id   UUID,
  dedupe_key  TEXT,
  read        BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 2.17 `reports`
```sql
CREATE TABLE reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN (
                  'compliance','audit','risk','observation','sama','custom'
                )),
  format        TEXT DEFAULT 'pdf' CHECK (format IN ('pdf','excel','word','csv')),
  period        TEXT DEFAULT 'monthly',
  status        TEXT DEFAULT 'draft' CHECK (status IN ('draft','generating','ready','scheduled')),
  generated_at  TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  recipients    TEXT[] DEFAULT '{}',
  filters       JSONB DEFAULT '{}',
  storage_path  TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
```

### 2.18 Templates (`audit_templates`, `policy_templates`, `sama_letter_templates`)
```sql
CREATE TABLE audit_templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  name                    TEXT NOT NULL,
  name_ar                 TEXT,
  audit_type              TEXT NOT NULL CHECK (audit_type IN ('internal','sama','sharia')),
  category                TEXT NOT NULL,
  priority                TEXT DEFAULT 'medium',
  frequency               TEXT DEFAULT 'annual',
  frequency_schedule      JSONB,
  default_title           TEXT NOT NULL,
  default_title_ar        TEXT,
  default_description     TEXT NOT NULL,
  default_description_ar  TEXT,
  default_checklist_items TEXT[] DEFAULT '{}',
  default_team_roles      TEXT[] DEFAULT '{}',
  framework               TEXT,
  status                  TEXT DEFAULT 'active',
  usage_count             INTEGER DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE policy_templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  name                    TEXT NOT NULL,
  name_ar                 TEXT,
  category                TEXT NOT NULL,
  approval_tier           TEXT NOT NULL,
  frequency               TEXT,
  frequency_schedule      JSONB,
  default_description     TEXT NOT NULL,
  default_description_ar  TEXT,
  default_workflow_steps  JSONB DEFAULT '[]',
  version_pattern         TEXT DEFAULT 'v{major}.{minor}',
  framework               TEXT,
  status                  TEXT DEFAULT 'active',
  usage_count             INTEGER DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sama_letter_templates (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id),
  name                        TEXT NOT NULL,
  type                        TEXT NOT NULL,
  icon                        TEXT,
  color                       TEXT,
  description                 TEXT,
  status                      TEXT DEFAULT 'Active',
  default_subject_en          TEXT,
  default_subject_ar          TEXT,
  default_body_en             TEXT,
  default_body_ar             TEXT,
  default_signer_name         TEXT,
  default_signer_title        TEXT,
  default_signer_name_ar      TEXT,
  default_signer_title_ar     TEXT,
  default_signature_image_url TEXT,
  default_sama_department     TEXT,
  default_recipient_name      TEXT,
  default_recipient_org       TEXT,
  default_recipient_city      TEXT,
  default_recipient_name_ar   TEXT,
  default_recipient_org_ar    TEXT,
  default_recipient_city_ar   TEXT,
  usage_count                 INTEGER DEFAULT 0,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now()
);
```

### 2.19 Settings & Compliance Scores
```sql
CREATE TABLE compliance_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) UNIQUE,
  weights         JSONB NOT NULL DEFAULT '{"auditCompletion":25,"observationClosure":25,"riskPosture":20,"policyCurrency":15,"trainingCompletion":15}',
  target_score    INTEGER DEFAULT 85,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) UNIQUE,
  dashboard_view  TEXT DEFAULT 'executive',
  timezone        TEXT DEFAULT 'Asia/Riyadh',
  date_format     TEXT DEFAULT 'DD/MM/YYYY',
  notification_preferences JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE compliance_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  framework_id    TEXT NOT NULL DEFAULT 'overall',
  period_filter   TEXT NOT NULL,
  overall         NUMERIC NOT NULL,
  change_pct      NUMERIC DEFAULT 0,
  confidence      TEXT NOT NULL,
  components      JSONB NOT NULL,
  deductions      JSONB NOT NULL DEFAULT '[]',
  trend           JSONB NOT NULL DEFAULT '[]',
  calculated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, framework_id, period_filter)
);
-- Note: framework_id uses sentinel 'overall' (not NULL) for the Track A score.
-- This ensures the UNIQUE constraint and ON CONFLICT upsert work correctly —
-- Postgres NULLS DISTINCT semantics would otherwise allow duplicate overall-score rows.

CREATE TABLE requirements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  name                TEXT NOT NULL,
  kind                TEXT DEFAULT 'rule' CHECK (kind IN ('rule','policy')),
  category            TEXT,
  affected_department TEXT,
  release_date        DATE,
  status              TEXT DEFAULT 'pending'
                        CHECK (status IN ('implementing','drafting','completed','pending')),
  due_date            DATE,
  description         TEXT,
  progress            INTEGER DEFAULT 0,
  reference_url       TEXT,
  linked_circular_id  UUID REFERENCES circulars(id),
  checklist           JSONB DEFAULT '[]',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
```

Spec note: **Total ≈ 50 tables covering all 95+ frontend TypeScript types.**

---

## 3. API Endpoints

All require `Authorization: Bearer <jwt>`. Tenant-scoped. ~160 endpoints across 25 groups.

### 3.1 Auth
| Method | Path | Description | Body | Response |
|---|---|---|---|---|
| POST | `/api/auth/login` | Login with email/password | `{ email, password }` | `{ user, token, refreshToken }` |
| POST | `/api/auth/logout` | Invalidate session | — | 204 |
| POST | `/api/auth/refresh` | Refresh JWT | `{ refreshToken }` | `{ token, refreshToken }` |
| GET | `/api/auth/me` | Get current user profile | — | `User` |
| PATCH | `/api/auth/me` | Update own profile | `Partial<User>` | `User` |

### 3.2 Audits
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/audits` | — | `{ data: Audit[], pagination }` |
| GET | `/api/audits/:id` | — | `Audit` (with documents, team, comments) |
| POST | `/api/audits` | `CreateAuditDTO` | `Audit` |
| PATCH | `/api/audits/:id` | `Partial<Audit>` | `Audit` |
| DELETE | `/api/audits/:id` | — | 204 (soft delete) |
| POST | `/api/audits/:id/documents` | multipart/form-data | `AuditDocument` |
| DELETE | `/api/audits/:id/documents/:docId` | — | 204 |
| POST | `/api/audits/:id/team` | `{ userId, role }` | `AuditTeamMember` |
| DELETE | `/api/audits/:id/team/:memberId` | — | 204 |
| POST | `/api/audits/:id/comments` | `{ content }` | `AuditComment` |
| PATCH | `/api/audits/:id/comments/:cid` | `{ content }` | `AuditComment` |
| DELETE | `/api/audits/:id/comments/:cid` | — | 204 |

### 3.3 Audit Tasks
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/audits/:auditId/tasks` | — | `{ data: AuditTask[] }` |
| POST | `/api/audits/:auditId/tasks` | `CreateTaskDTO` | `AuditTask` |
| PATCH | `/api/audit-tasks/:id` | `Partial<AuditTask>` | `AuditTask` |
| DELETE | `/api/audit-tasks/:id` | — | 204 |
| PATCH | `/api/audit-tasks/:id/toggle` | `{ completed }` | `AuditTask` |

### 3.4 Audit Logs
| Method | Path | Response |
|---|---|---|
| GET | `/api/audits/:auditId/logs` | `{ data: AuditLog[] }` |
| GET | `/api/audit-logs` | `{ data: AuditLog[], pagination }` (admin) |

### 3.5 Observations
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/observations` | — | `{ data: Observation[], pagination }` |
| GET | `/api/observations/:id` | — | `Observation` (full) |
| POST | `/api/observations` | `CreateObsDTO` | `Observation` |
| PATCH | `/api/observations/:id` | `Partial<Observation>` | `Observation` |
| DELETE | `/api/observations/:id` | — | 204 (soft delete) |
| POST | `/api/observations/:id/comments` | `{ text }` | `ObservationUpdate` |
| PATCH | `/api/observations/:id/comments/:cid` | `{ text }` | `ObservationUpdate` |
| DELETE | `/api/observations/:id/comments/:cid` | — | 204 |
| POST | `/api/observations/:id/checklist` | `{ text }` | `ChecklistItem` |
| PATCH | `/api/observations/:id/checklist/:iid` | `{ text?, completed? }` | `ChecklistItem` |
| DELETE | `/api/observations/:id/checklist/:iid` | — | 204 |
| POST | `/api/observations/:id/documents` | multipart | `Document` |
| DELETE | `/api/observations/:id/documents/:did` | — | 204 |
| POST | `/api/observations/:id/remediation` | `RemediationPlanDTO` | `RemediationPlan` |
| PATCH | `/api/observations/:id/remediation/review` | `{ approved, notes }` | `RemediationPlan` |
| POST | `/api/observations/:id/closure` | `{ notes? }` | `ClosureRequest` |
| PATCH | `/api/observations/:id/closure/review` | `{ approved, notes }` | `ClosureReview` |
| PATCH | `/api/observations/:id/leader` | `{ newLeaderId }` | `Observation` |

### 3.6 Risks
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/risks` | — | `{ data: Risk[], pagination }` |
| GET | `/api/risks/:id` | — | `Risk` |
| POST | `/api/risks` | `CreateRiskDTO` | `Risk` |
| PATCH | `/api/risks/:id` | `Partial<Risk>` | `Risk` |
| DELETE | `/api/risks/:id` | — | 204 |
| POST | `/api/risks/:id/checklist` | `{ text }` | `ChecklistItem` |
| PATCH | `/api/risks/:id/checklist/:iid` | `{ text?, completed? }` | `ChecklistItem` |
| DELETE | `/api/risks/:id/checklist/:iid` | — | 204 |
| GET | `/api/risks/:id/history` | — | `{ data: RiskHistoryEntry[] }` |

### 3.7 Policies
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/policies` | — | `{ data: Policy[], pagination }` |
| GET | `/api/policies/:id` | — | `Policy` (full) |
| POST | `/api/policies` | `CreatePolicyDTO` | `Policy` |
| PATCH | `/api/policies/:id` | `Partial<Policy>` | `Policy` |
| DELETE | `/api/policies/:id` | — | 204 (archive) |
| POST | `/api/policies/:id/submit-review` | — | `Policy` |
| POST | `/api/policies/:id/approve` | `{ notes? }` | `Policy` |
| POST | `/api/policies/:id/initiate-review` | — | `Policy` |
| POST | `/api/policies/:id/attachments` | multipart | `Attachment` |
| DELETE | `/api/policies/:id/attachments/:aid` | — | 204 |
| POST | `/api/policies/:id/evidence` | multipart | `Evidence` |
| DELETE | `/api/policies/:id/evidence/:eid` | — | 204 |
| POST | `/api/policies/:id/workflow-steps` | `{ step, actionType }` | `WorkflowStep` |
| PATCH | `/api/policies/:id/workflow-steps/:sid` | `Partial<Step>` | `Step` |
| GET | `/api/policies/review-alerts` | — | `{ data: Policy[] }` |

### 3.8 Circulars / Regulatory Rules
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/circulars` | — | `{ data: Circular[], pagination }` |
| GET | `/api/circulars/:id` | — | `Circular` (full) |
| POST | `/api/circulars` | `CreateCircularDTO` | `Circular` |
| PATCH | `/api/circulars/:id` | `Partial<Circular>` | `Circular` |
| DELETE | `/api/circulars/:id` | — | 204 |
| POST | `/api/circulars/:id/articles` | `ArticleDTO` | `CircularArticle` |
| PATCH | `/api/circulars/:id/articles/:aid` | `Partial<Article>` | `Article` |
| POST | `/api/circulars/:id/workflow/advance` | `{ notes? }` | `Circular` |
| POST | `/api/circulars/:id/pending-edit` | `Partial<Circular>` | `PendingEdit` |
| PATCH | `/api/circulars/:id/pending-edit/approve` | `{ approvalId }` | `Circular` |
| POST | `/api/circulars/:id/cap-attachments` | multipart | `Attachment` |

### 3.9 SAMA Letters
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/sama-letters` | — | `{ data: SAMALetter[], pagination }` |
| GET | `/api/sama-letters/:id` | — | `SAMALetter` |
| POST | `/api/sama-letters` | `CreateLetterDTO` | `SAMALetter` |
| PATCH | `/api/sama-letters/:id` | `Partial<SAMALetter>` | `SAMALetter` |
| DELETE | `/api/sama-letters/:id` | — | 204 |
| POST | `/api/sama-letters/:id/submit` | — | `SAMALetter` |
| POST | `/api/sama-letters/:id/approve/:step` | `{ notes? }` | `SAMALetter` |
| POST | `/api/sama-letters/:id/reject/:step` | `{ notes }` | `SAMALetter` |
| POST | `/api/sama-letters/:id/send` | — | `SAMALetter` |
| POST | `/api/sama-letters/:id/response-received` | — | `SAMALetter` |
| POST | `/api/sama-letters/:id/attachments` | multipart | `Attachment` |

### 3.10 Correspondence
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/correspondence` | — | `{ data: Correspondence[], pagination }` |
| GET | `/api/correspondence/:id` | — | `Correspondence` |
| POST | `/api/correspondence` | `CreateCorrespondenceDTO` | `Correspondence` |
| PATCH | `/api/correspondence/:id` | `Partial<Correspondence>` | `Correspondence` |
| DELETE | `/api/correspondence/:id` | — | 204 |

### 3.11 Advisory Requests
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/advisory` | — | `{ data: AdvisoryRequest[], pagination }` |
| GET | `/api/advisory/:id` | — | `AdvisoryRequest` |
| POST | `/api/advisory` | `CreateAdvisoryDTO` | `AdvisoryRequest` |
| PATCH | `/api/advisory/:id` | `Partial<AdvisoryRequest>` | `AdvisoryRequest` |
| DELETE | `/api/advisory/:id` | — | 204 |
| POST | `/api/advisory/:id/notes` | `{ content }` | `AdvisoryNote` |
| PATCH | `/api/advisory/:id/status` | `{ status }` | `AdvisoryRequest` |

### 3.12 Calendar Events
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/calendar` | — | `{ data: CalendarEvent[] }` |
| GET | `/api/calendar/:id` | — | `CalendarEvent` |
| POST | `/api/calendar` | `CreateEventDTO` | `CalendarEvent` |
| PATCH | `/api/calendar/:id` | `Partial<CalendarEvent>` | `CalendarEvent` |
| DELETE | `/api/calendar/:id` | — | 204 |

### 3.13 Training
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/training/courses` | — | `{ data: TrainingCourse[] }` |
| POST | `/api/training/courses` | `CreateCourseDTO` | `TrainingCourse` |
| PATCH | `/api/training/courses/:id` | `Partial<Course>` | `TrainingCourse` |
| DELETE | `/api/training/courses/:id` | — | 204 |
| GET | `/api/training/employees` | — | `{ data: TrainingEmployee[] }` |
| POST | `/api/training/employees` | `CreateEmployeeDTO` | `TrainingEmployee` |
| PATCH | `/api/training/employees/:id/courses/:cid` | `{ status, progress, score }` | `CourseProgress` |
| GET | `/api/training/overview` | — | `TrainingOverviewStats` |
| GET | `/api/training/saudization` | — | `SaudizationMetrics` |
| PUT | `/api/training/saudization` | `SaudizationMetrics` | `SaudizationMetrics` |
| POST | `/api/training/upload` | multipart CSV | `{ imported: number }` |

### 3.14 Team
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/team` | — | `{ data: TeamMember[] }` |
| GET | `/api/team/:id` | — | `TeamMember` |
| POST | `/api/team/invite` | `{ invites: InviteDTO[] }` | `TeamMember[]` |
| PATCH | `/api/team/:id` | `Partial<TeamMember>` | `TeamMember` |
| DELETE | `/api/team/:id` | — | 204 |
| PATCH | `/api/team/:id/permissions` | `{ accessControls }` | `TeamMember` |
| POST | `/api/team/:id/unassign` | `{ assignmentIndex }` | `TeamMember` |
| POST | `/api/team/:id/reassign` | `{ from, to, taskIndex }` | `{ from, to }` |

### 3.15 User Activity Logs
| Method | Path | Response |
|---|---|---|
| GET | `/api/user-logs` | `{ data: UserLog[], pagination }` |

### 3.16 Messages
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/messages/threads` | — | `{ data: MessageThread[] }` |
| GET | `/api/messages/threads/:id` | — | `{ thread, messages }` |
| POST | `/api/messages/threads` | `{ participantIds, firstMessage }` | `MessageThread` |
| DELETE | `/api/messages/threads/:id` | — | 204 |
| POST | `/api/messages/threads/:id/messages` | `{ content }` | `Message` |
| PATCH | `/api/messages/threads/:id/read` | — | 204 |
| POST | `/api/messages/threads/:id/members` | `{ userIds }` | `MessageThread` |
| DELETE | `/api/messages/threads/:id/members/:uid` | — | 204 |

### 3.17 Notifications
| Method | Path | Response |
|---|---|---|
| GET | `/api/notifications` | `{ data: Notification[], unreadCount }` |
| PATCH | `/api/notifications/:id/read` | 204 |
| POST | `/api/notifications/read-all` | 204 |
| DELETE | `/api/notifications/:id` | 204 |
| DELETE | `/api/notifications` | 204 (clear all) |

### 3.18 Reports
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/reports` | — | `{ data: Report[] }` |
| POST | `/api/reports` | `CreateReportDTO` | `Report` |
| POST | `/api/reports/:id/generate` | — | `Report (status: generating)` |
| GET | `/api/reports/:id/download` | — | Binary stream |
| DELETE | `/api/reports/:id` | — | 204 |

### 3.19 Departments
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/departments` | — | `{ data: Department[] }` |
| POST | `/api/departments` | `{ name, nameAr }` | `Department` |
| PATCH | `/api/departments/:id` | `{ name?, nameAr? }` | `Department` |
| DELETE | `/api/departments/:id` | — | 204 (non-default only) |

### 3.20 Frameworks
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/frameworks` | — | `{ data: FrameworkConfig[] }` |
| GET | `/api/frameworks/:id` | — | `FrameworkConfig` |
| PATCH | `/api/frameworks/:id` | `Partial<Config>` | `FrameworkConfig` |
| PATCH | `/api/frameworks/:id/toggle` | `{ enabled }` | `FrameworkConfig` |
| GET | `/api/frameworks/pinned` | — | `{ data: FrameworkConfig[] }` (max 3) |
| PATCH | `/api/frameworks/pinned` | `{ ids: string[] }` | `{ pinnedIds }` |

### 3.21 Compliance Scores
| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/compliance/score` | `?period=3months` | `ComplianceScoreResult` |
| GET | `/api/compliance/score/:frameworkId` | `?period=3months` | `PerFrameworkScore` |
| POST | `/api/compliance/recalculate` | — | `{ jobId }` |

### 3.22 Settings & Preferences
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/settings/compliance` | — | `ComplianceSettings` |
| PUT | `/api/settings/compliance` | `ComplianceSettings` | `ComplianceSettings` |
| GET | `/api/settings/preferences` | — | `UserPreferences` |
| PUT | `/api/settings/preferences` | `UserPreferences` | `UserPreferences` |

### 3.23 Templates
Endpoints for `audit`, `policy`, `sama-letter` template types:
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/templates/audit` | — | `{ data: AuditTemplate[] }` |
| POST | `/api/templates/audit` | `AuditTemplateDTO` | `AuditTemplate` |
| PATCH | `/api/templates/audit/:id` | `Partial<AuditTemplate>` | `AuditTemplate` |
| DELETE | `/api/templates/audit/:id` | — | 204 |
| GET | `/api/templates/policy` | — | `{ data: PolicyTemplate[] }` |
| POST | `/api/templates/policy` | `PolicyTemplateDTO` | `PolicyTemplate` |
| PATCH | `/api/templates/policy/:id` | `Partial<PolicyTemplate>` | `PolicyTemplate` |
| DELETE | `/api/templates/policy/:id` | — | 204 |
| GET | `/api/templates/sama-letter` | — | `{ data: LetterTemplate[] }` |
| POST | `/api/templates/sama-letter` | `LetterTemplateDTO` | `LetterTemplate` |
| PATCH | `/api/templates/sama-letter/:id` | `Partial<LetterTemplate>` | `LetterTemplate` |
| DELETE | `/api/templates/sama-letter/:id` | — | 204 |

### 3.24 Requirements
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/requirements` | — | `{ data: Requirement[], pagination }` |
| GET | `/api/requirements/:id` | — | `Requirement` |
| POST | `/api/requirements` | `CreateRequirementDTO` | `Requirement` |
| PATCH | `/api/requirements/:id` | `Partial<Requirement>` | `Requirement` |
| DELETE | `/api/requirements/:id` | — | 204 |

### 3.25 PDF Export
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/export/pdf` | `{ templateId, entityId, locale }` | `{ jobId }` |
| GET | `/api/export/pdf/:jobId` | — | Binary stream (application/pdf) |

---

## 4. RBAC Model

### Roles (4 backend roles, mapped from 3 frontend roles)

| Frontend Role | Backend Role | Description |
|---|---|---|
| officer (default) | `auditor` | View-only across modules + FULL observation access (create, edit, comment). Default backend role when a frontend officer is provisioned. |
| officer (read-only) | `viewer` | View-only across all modules including observations. Cannot mutate. Provisioned only when invite payload sets `readOnly=true`. |
| manager | `compliance_officer` | Create, edit, comment, export. Cannot delete or manage settings. |
| admin | `org_admin` | Full access — delete, settings, team management. |

**Provisioning rule:** `POST /api/team/invite` with `role=officer` creates a backend user with `role=auditor` by default. If `readOnly=true`, backend role is `viewer`. One-way at provisioning time; admin must edit the user record to change later.

### Permission Matrix (25 permissions × 4 roles)

| Permission | Viewer | Auditor | Manager | Admin |
|---|:---:|:---:|:---:|:---:|
| view | ✓ | ✓ | ✓ | ✓ |
| comment | — | ✓ | ✓ | ✓ |
| create | — | — | ✓ | ✓ |
| edit | — | — | ✓ | ✓ |
| delete | — | — | — | ✓ |
| audit:view | ✓ | ✓ | ✓ | ✓ |
| audit:comment | — | — | ✓ | ✓ |
| audit:create | — | — | ✓ | ✓ |
| audit:edit | — | — | ✓ | ✓ |
| audit:delete | — | — | — | ✓ |
| observation:view | ✓ | ✓ | ✓ | ✓ |
| observation:comment | — | ✓ | ✓ | ✓ |
| observation:create | — | ✓ | ✓ | ✓ |
| observation:edit | — | ✓ | ✓ | ✓ |
| observation:delete | — | — | — | ✓ |
| report:view | ✓ | ✓ | ✓ | ✓ |
| report:create | — | — | ✓ | ✓ |
| report:delete | — | — | — | ✓ |
| export | ✓ | ✓ | ✓ | ✓ |
| settings:view | — | — | — | ✓ |
| settings:edit | — | — | — | ✓ |
| team:view | — | — | — | ✓ |
| team:invite | — | — | — | ✓ |
| team:edit | — | — | — | ✓ |
| team:remove | — | — | — | ✓ |

### Express Authorize Middleware Pattern
```ts
// middleware/authorize.ts
export function authorize(...requiredPermissions: string[]) {
  return (req, res, next) => {
    const userRole = req.userRole
    const userPermissions = ROLE_PERMISSIONS[userRole] || []
    const customPermissions = req.userPermissions || []
    const allPermissions = new Set([...userPermissions, ...customPermissions])
    const hasAll = requiredPermissions.every(p => allPermissions.has(p))
    if (!hasAll) {
      return res.status(403).json({ error: 'Insufficient permissions', required: requiredPermissions })
    }
    next()
  }
}

// Usage:
router.post('/api/audits', authorize('audit:create'), AuditController.create)
router.delete('/api/audits/:id', authorize('audit:delete'), AuditController.delete)
```

### Observation-Specific Ownership Rules

Observations have role-based AND ownership-based permissions:
- **Leader permissions**: creator or transferred leader can manage, transfer leadership, edit.
- **Assignee permissions**: can submit remediation, upload documents, request closure.
- **Closure review**: only leader OR manager/admin can approve/reject closure.
- **Comment ownership**: users can edit/delete own comments; manager+ can edit any.

Example service check:
```ts
async submitRemediation(tenantId, obsId, userId, plan) {
  const obs = await this.repo.findById(tenantId, obsId)
  const isLeader = obs.leader_id === userId
  const isAssignee = await this.repo.isAssignee(obsId, userId)
  if (!isLeader && !isAssignee) {
    throw new ForbiddenError('Only leader or assignee can submit remediation')
  }
}
```

### Custom Permissions
JWT carries a `permissions` array that is merged with role permissions. `users.permissions TEXT[]` stores per-user overrides. `team_member_access_controls` (`user_id`, `label`, `enabled`) is the structured form.

---

## 5. Workflows & State Machines

### 5.1 SAMA Letter Lifecycle
Status transitions: `draft → pending-approval → approved → sent → response-received` (or `→ overdue` if `response_deadline < now` while still `sent`).

**3-step approval chain** (`sama_letter_approval_steps`, step IN 1,2,3):
- `POST /:id/submit` → status `pending-approval`, creates 3 approval-step rows.
- `POST /:id/approve/:step` `{ notes? }` → step status `approved`. When step=3 approved → letter status `approved`.
- `POST /:id/reject/:step` `{ notes }` → step status `rejected`.
- `POST /:id/send` → status `sent`, sets `sent_date`.
- `POST /:id/response-received` → status `response-received`, sets `response_received_date`.
- Daily cron (`sama.letter.overdue.check`): if `response_deadline < now` and still `sent`, flip to `overdue` and notify.

### 5.2 Observation Closure Lifecycle
Status enum: `open | in_progress | resolved | closed`.

**Remediation plan flow** (`remediation_plans`, status: `draft → submitted → approved | rejected`):
1. `POST /:id/remediation` (leader/assignee) → creates `remediation_plans` row, status `submitted`.
2. `PATCH /:id/remediation/review` `{ approved, notes }` (leader or manager+) → status `approved` or `rejected`.

**Closure flow** (`closure_requests` → `closure_reviews`):
1. `POST /:id/closure` (leader/assignee) → inserts `closure_requests`.
2. `PATCH /:id/closure/review` `{ approved, notes }` (leader or manager+) → inserts `closure_reviews`. If `approved`, observation → `closed`.

**Leader transfer**: `PATCH /:id/leader` `{ newLeaderId }` — only current leader (or admin) can call.

### 5.3 Policy Review Cycle
Status enum: `draft | under-review | approved | expired | overdue | requires-review`.

- `POST /:id/submit-review` → `under-review`, appends `policy_workflow_steps` (sort_order incremented).
- `POST /:id/approve` `{ notes? }` → `approved`, sets `approved_date`, computes `next_review_date = approved_date + review_cycle_days`.
- `POST /:id/initiate-review` → creates new `policy_review_cycles` row (`label`, `initiated_at`), resets workflow.

**Daily cron** (`policy.status.check` at 02:00) per tenant per non-terminal policy:
- If `next_review_date < today` and status != `overdue` → set `overdue`, increment `overdue_count`, set `last_overdue_date`, notify owner.
- Else if `next_review_date <= today+90d` and status == `approved` → set `requires-review`, notify owner.

`policy_workflow_steps.step_state` enum: `pending-approval | awaiting-response | awaiting-manager`.
Approval tiers: `board | management | sharia | agm`.

### 5.4 Circular Workflow
3 phases (`circular_workflow_steps.phase` ∈ {0,1,2}). Each step has bilingual `label`, `action_label`, `requires_notes`, `action_type`.

- `POST /:id/workflow/advance` `{ notes? }` → marks current step complete, advances to next.
- `POST /:id/pending-edit` `Partial<Circular>` → stores in `circular_pending_edits` with `data` JSONB + `field_changes`.
- `PATCH /:id/pending-edit/approve` `{ approvalId }` → records approval in `approvals` JSONB array; when threshold reached, applies edit, bumps `circular_versions`.

CAP (Corrective Action Plan): `cap_status`, `cap_deadline`, `cap_response_deadline`. Daily cron `circular.cap.deadline.check` notifies if past deadline and not approved/completed.

### 5.5 Audit Lifecycle
Status: `pending → in_progress → completed` (or `→ overdue` if past `due_date` and not completed).
- Daily cron `audit.overdue.check` flips overdue, generates notification.
- `audit_tasks` mirror the same status enum.

### 5.6 Advisory Request
Status: `pending → in_progress → completed`. `PATCH /:id/status` flips status.

### 5.7 Remediation Plan (sub-flow of observation)
Status: `draft → submitted → approved | rejected`.

### 5.8 Framework Versioning
- `frameworks.version` (TEXT) + `is_active` (BOOLEAN). New version inserted with old set `is_active=false`.
- `framework_version_migrations` tracks migrations: `pending → in_progress → completed`.
- Workflow: notification → admin triggers "Upgrade Framework" → backend creates new row + copies dept assignments/weights → optional background job updates `framework_ids[]` on entities → scores recalculated.
- Entities reference framework IDs via `framework_ids TEXT[]` — historical data naturally preserves association.

---

## 6. Audit / Activity Logging

Two distinct logs:

### 6.1 `audit_logs` (per-audit activity)
Scoped to a single `audit_id`. Row shape: `id, tenant_id, audit_id, action, description, user_id, metadata (JSONB), created_at`. Append-only by convention (no UPDATE/DELETE routes).

### 6.2 `user_activity_logs` (cross-entity)
Tenant-wide user action log. Shape:
```
id, tenant_id, user_id, user_name (denormalized), action, module, details, ip_address, metadata (JSONB), created_at
```
Read endpoint: `GET /api/user-logs`. Append-only.

### 6.3 Auxiliary History/Timeline Tables
Also append-only per convention:
- `observation_timeline` — date, description (en/ar), action_type, user info, target_id, metadata.
- `policy_activity_log` — bilingual `text_en`/`text_ar`, type, note.
- `risk_history` — action, previous_value/new_value, notes.
- `circular_timeline` — bilingual title, status.
- `sama_letter_timeline` — title, date, user_name, status.

### 6.4 What Events Get Logged (implicit from triggers)
- Entity mutations (create/update/delete) — written by service layer.
- Status transitions on audits, observations, policies, circulars, SAMA letters.
- Approval/rejection on SAMA letter steps, remediation plans, closure reviews, circular pending edits.
- Leader transfers on observations.
- Document/attachment uploads.
- Cron-driven status flips (overdue, requires-review).

Retention is **not explicitly specified** in the script — assume indefinite retention pending product decision.

---

## 7. Background Jobs (pg-boss)

All jobs tenant-scoped; worker process runs alongside Express API.

| Job | Schedule | Trigger | Description |
|---|---|---|---|
| `compliance.score.recalculate` | Every 1 hour | Also on entity mutations | Recalc overall + per-framework scores, upsert into `compliance_scores`. |
| `policy.status.check` | Daily 02:00 | — | Flip non-draft/non-expired policies: `overdue` if `next_review_date < today`, `requires-review` if ≤90 days. Increments `overdue_count`. |
| `sama.letter.overdue.check` | Daily 02:00 | — | Sent letters where `response_deadline < now` → `overdue` + notify. |
| `audit.overdue.check` | Daily 02:00 | — | Audits past due → `overdue` + notify. |
| `notification.generate` | Event-driven | Entity mutations | Generates notifications for new assignments, status changes, approaching deadlines. |
| `notification.email.digest` | Weekly Mon 08:00 | — | Aggregates unread notifications, sends email digest where `emailDigestEnabled=true`. |
| `report.generate` | On-demand | `POST /api/reports/:id/generate` | Generates PDF/Excel async; updates `status='ready'`, sets `storage_path`. |
| `training.overdue.check` | Daily 02:00 | — | `employee_course_progress` where `due_date < today` and not completed → `overdue`. |
| `circular.cap.deadline.check` | Daily 02:00 | — | Circulars where `cap_deadline < today` and `cap_status` not approved/completed → notify. |
| `burnout.detection` | Daily 06:00 | — | Counts overdue tasks, active assignments, consecutive high-workload days; updates `users.burnout_since`. |

### Handler Pattern
```ts
export async function policyStatusCheck(job: Job) {
  const tenantIds = await tenantRepo.getAllActiveIds()
  for (const tenantId of tenantIds) {
    await setTenantContext(tenantId)
    const policies = await policyRepo.findNonTerminal(tenantId)
    const today = new Date().toISOString().split('T')[0]
    const ninetyDays = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
    for (const policy of policies) {
      if (policy.next_review_date < today && policy.status !== 'overdue') {
        await policyRepo.update(tenantId, policy.id, {
          status: 'overdue',
          overdue_count: policy.overdue_count + 1,
          last_overdue_date: policy.next_review_date,
        })
        await notificationService.create(tenantId, {
          userId: policy.owner_id, title: 'Policy Overdue',
          message: `Policy "${policy.name}" is past its review date`,
          type: 'warning', route: `/policies?id=${policy.id}`,
        })
      } else if (policy.next_review_date <= ninetyDays && policy.status === 'approved') {
        await policyRepo.update(tenantId, policy.id, { status: 'requires-review' })
        await notificationService.create(tenantId, { /* info notification */ })
      }
    }
  }
}
```

---

## 8. Compliance Scoring Engine

Ported from `src/lib/compliance-engine.ts` (651 lines). Runs server-side as a service, triggered by pg-boss, cached in `compliance_scores`.

### 8.1 Track A — Overall Compliance Score
5 fixed components, weights summing to 100 (in `compliance_settings.weights`). Components with "insufficient" confidence (≤2 data points) are excluded; weights renormalized.

| Component | Default Weight | Formula | Confidence |
|---|---|---|---|
| Audit Completion | 25% | Σ(credit per audit) / count × 100. Full credit for on-time. Partial: 0.85 ≤7d, 0.70 ≤14d, 0.50 ≤30d, 0.25 >30d. 0 for incomplete. | ≤2 insufficient, ≤5 low, ≤15 moderate, >15 high |
| Observation Closure | 25% | Σ(severity-weighted closed) / Σ(severity-weighted total) × 100. Weights: critical=4, high=2, medium=1, low=0.5 | same |
| Risk Posture | 20% | Σ(L×I for resolved/accepted) / Σ(L×I all) × 100 | same |
| Policy Currency | 15% | Count(approved policies with next_review_date > now) / Count(approved) × 100 | same |
| Training Completion | 15% | Average of all training completionRate values | same |

### 8.2 Track B — Per-Framework Scores
Each enabled framework has **7 stored weights** in `framework_weights` (must sum to 100): `audits, observations, letters, policies, circulars, risk_posture, training`. Data is filtered by `framework_ids` array overlap. The 7 stored weights collapse to **5 computed components**:

| Component | Source Weight(s) | Calculator | Notes |
|---|---|---|---|
| Audits | `audits` | `calcAuditCompletion` | Filtered by frameworkIds. |
| Observations | `observations` | `calcObservationClosure` | Filtered. |
| Circulars | `circulars` | `calcCircularImplementation` | Priority-weighted progress; filtered. |
| Policies | `policies` | `calcPolicyCurrency` | Filtered. |
| Tasks | `letters + risk_posture + training` | `calcTaskScore` | Combined weight. Formula: `completion×50% − overdue×30% + severity×20%`. |

**MUST preserve this 7→5 mapping** to match frontend `calcPerFrameworkScore()` bit-for-bit.

### 8.3 Deduction Rules
| Rule | Points | Severity | Component |
|---|---|---|---|
| Each critical observation open/in_progress | -8 per obs | critical | observationClosure |
| Each high observation open/in_progress | -3 per obs | high | observationClosure |
| Overdue audits | -5 per audit | high | auditCompletion |
| Late-completed audits | -2 per audit | medium | auditCompletion |
| Medium observations open | -1 per obs | medium | observationClosure |
| Insufficient data component | -2 per component | low | (varies) |
| Component score <60% | -3 per component | medium | (varies) |

### 8.4 Period Filtering
Input data filtered by `created_at` within period window: 3 months, 6 months, 12 months, or fiscal year (Jan 1 – Dec 31). Change calc compares current vs previous period of same duration.

### 8.5 Trend
- Fiscal periods → quarterly snapshots (Q1–Q4).
- Other periods → monthly snapshots.
- Each snapshot computes partial score with cumulative data up to that point.

### 8.6 Service Sketch
```ts
export class ComplianceScoreService {
  async calculate(tenantId: string, period: PeriodFilter, frameworkId?: string) {
    // 1. Fetch entity slices from respective repositories
    // 2. Fetch compliance_settings (weights, target)
    // 3. Fetch framework_configs (enabled + weights)
    // 4. Call calculateComplianceScore(input)
    // 5. Upsert into compliance_scores (sentinel framework_id='overall' for Track A)
    // 6. Return result
  }
}
```

---

## 9. LaTeX PDF Generation

### 9.1 Architecture
```
Client → POST /api/export/pdf { templateId, entityId, locale }
     → ExportService.generate()
       → Fetch entity data from DB
       → Render Handlebars template → .tex file
       → Execute: xelatex -interaction=nonstopmode output.tex
       → Upload PDF to Supabase Storage
       → Return { jobId, downloadUrl }
```

### 9.2 Docker Setup
```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y \
    texlive-xetex \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-lang-arabic \
    fonts-noto \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
```

### 9.3 LaTeX Sanitization (Security)
```ts
const LATEX_SPECIAL = /[&%$#_{}~^\\]/g
const ESCAPE_MAP: Record<string, string> = {
  '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#',
  '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}', '\\': '\\textbackslash{}',
}
function sanitizeLatex(input: string): string {
  return input.replace(LATEX_SPECIAL, (char) => ESCAPE_MAP[char] || char)
}
```

### 9.4 Template Directory
```
templates/latex/
  common/ { header.tex, footer.tex, logo.tex }
  audit-report.tex
  observation-report.tex
  risk-register.tex
  policy-document.tex
  sama-letter.tex
  compliance-scorecard.tex
  training-report.tex
  fallback.tex
```

### 9.5 Template-to-Entity Map
| Template | Entity | Key Data |
|---|---|---|
| audit-report.tex | Audit | Title, type, status, progress, team, documents, comments, tasks |
| observation-report.tex | Observation | Title, severity, status, checklist, remediation, timeline |
| risk-register.tex | Risk (batch) | All risks with scores, mitigation, heat map |
| policy-document.tex | Policy | Name, version, workflow, attachments, activity log |
| sama-letter.tex | SAMA Letter | Bilingual body, approval chain, signer block, attachments |
| compliance-scorecard.tex | Score Result | Overall score, components, deductions, trend chart (pgfplots) |
| training-report.tex | Training | Courses, employees, saudization, dept breakdown |
| fallback.tex | Any entity | JSON-to-table generic renderer |

### 9.6 Arabic/RTL Path
```latex
\usepackage{polyglossia}
\setmainlanguage{arabic}
\setotherlanguage{english}
\newfontfamily\arabicfont{Noto Naskh Arabic}[Script=Arabic]
\newfontfamily\englishfont{Noto Sans}

\begin{Arabic}{{subjectAr}}\end{Arabic}
\begin{english}{{subjectEn}}\end{english}
```

### 9.7 Frontend Integration
Existing `ExportModal` calls `POST /api/export/pdf`, polls `GET /api/export/pdf/:jobId` (or WebSocket), triggers browser download.

---

## 10. Environment & Handoff

### Required Env Vars
```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRY=24h
REFRESH_TOKEN_EXPIRY=7d

# pg-boss
PGBOSS_SCHEMA=pgboss

# LaTeX
LATEX_BINARY=/usr/bin/xelatex
LATEX_TEMP_DIR=/tmp/latex-render

# Application
API_PORT=3001
CORS_ORIGIN=https://your-app.vercel.app
NODE_ENV=production
```

### Implementation Order (from §11 of script)
1. Supabase project setup (Auth, Storage buckets)
2. Run all CREATE TABLE migrations (§2)
3. Enable RLS — Section 3.2 template on top-level, Section 3.2.1 parent-join on child tables
4. Express API scaffold (controller-service-repository)
5. Auth middleware + tenant context (JWT validation, RLS context per §1)
6. RBAC middleware (per §4)
7. CRUD routes (~160 endpoints per §3 — start with audits, observations, risks)
8. Compliance scoring service (port from `src/lib/compliance-engine.ts`)
9. pg-boss worker (10 jobs — start with score recalc + overdue checks)
10. LaTeX PDF generation (install texlive, build templates)
11. Frontend API integration (replace Zustand `// TODO: Replace with actual API call` placeholders)
12. E2E + load testing (multi-tenant isolation, concurrency)

### Architectural Notes
- **Zustand as cache**: existing 29 Zustand stores transition from source-of-truth to client-side cache. Mutation methods call backend first, update local state on success. Stores have `// TODO: Replace with actual API call` placeholders already.
- **File storage**: Supabase Storage, tenant-scoped buckets. `storage_path` columns reference object keys.
- **Notification dedupe**: `notifications.dedupe_key` prevents duplicate notification spam.
- **Soft delete**: all top-level data tables use `deleted_at`. Repos must filter `deleted_at IS NULL` by default.
- **Generated column**: `risks.risk_score = likelihood * impact` (STORED).
- **Unique constraints to remember**:
  - `users(tenant_id, email)`
  - `frameworks(tenant_id, regulatory_body_id, version)`
  - `policies(tenant_id, ref_code)`
  - `circulars(tenant_id, reference)`
  - `sama_letters(tenant_id, reference)`
  - `advisory_requests(tenant_id, ref)`
  - `compliance_scores(tenant_id, framework_id, period_filter)` — sentinel `'overall'` for Track A
  - `framework_weights(framework_id)` — UNIQUE + CHECK weights sum to 100
  - `audit_team_members(audit_id, user_id)`
  - `observation_assignees(observation_id, user_id)`
  - `employee_course_progress(employee_id, course_id)`
  - `sama_letter_approval_steps(letter_id, step)`
  - `team_member_access_controls(user_id, label)`
  - `saudization_metrics(tenant_id)` UNIQUE
  - `compliance_settings(tenant_id)` UNIQUE
  - `user_preferences(user_id)` UNIQUE
- **Indexes**: the script does not explicitly enumerate non-PK indexes beyond uniques. Implementer must add per query pattern (suggested: `(tenant_id, status)`, `(tenant_id, due_date)`, `(tenant_id, created_at)` on each top-level entity).
