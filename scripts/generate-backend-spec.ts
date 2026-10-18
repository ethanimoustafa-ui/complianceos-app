import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  PageBreak,
} from 'docx'
import * as fs from 'fs'
import * as path from 'path'

// ── Constants ────────────────────────────────────────────────────────────────
const FONT = 'Calibri'
const CODE_FONT = 'Courier New'
const BLUE = '1F4E79'
const LIGHT_GRAY = 'F2F2F2'
const WHITE = 'FFFFFF'

// ── Helpers ──────────────────────────────────────────────────────────────────

function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 120 },
    children: [new TextRun({ text, bold: true, font: FONT, size: 32, color: BLUE })],
  })
}

function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 100 },
    children: [new TextRun({ text, bold: true, font: FONT, size: 28, color: BLUE })],
  })
}

function p(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: FONT, size: 22 })],
  })
}

function bullet(text: string, level = 0): Paragraph {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: FONT, size: 22 })],
  })
}

function codeBlock(code: string): Paragraph[] {
  return code.split('\n').map(line =>
    new Paragraph({
      spacing: { after: 0, line: 260 },
      shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR, color: 'auto' },
      children: [new TextRun({ text: line || ' ', font: CODE_FONT, size: 18 })],
    })
  )
}

function tbl(headers: string[], rows: string[][]): Table {
  const borderStyle = {
    style: BorderStyle.SINGLE, size: 1, color: 'BFBFBF',
  }
  const borders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle }

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h => new TableCell({
      shading: { fill: BLUE, type: ShadingType.CLEAR, color: 'auto' },
      borders,
      children: [new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: h, bold: true, color: WHITE, font: FONT, size: 20 })],
      })],
    })),
  })

  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map(cell => new TableCell({
      shading: ri % 2 === 1 ? { fill: LIGHT_GRAY, type: ShadingType.CLEAR, color: 'auto' } : undefined,
      borders,
      children: [new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: cell, font: FONT, size: 20 })],
      })],
    })),
  }))

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  })
}

function pb(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] })
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 80 }, children: [] })
}

// ── Section 1: Project Overview ──────────────────────────────────────────────

function section1(): (Paragraph | Table)[] {
  return [
    h1('1. Project Overview'),
    p('ComplianceOS is a Governance, Risk & Compliance (GRC) platform purpose-built for Saudi financial institutions regulated by SAMA (Saudi Central Bank). It enables compliance officers, auditors, and executives to manage audits, observations, risk registers, policies, circulars, SAMA correspondence, training programs, and real-time compliance scoring — all in a bilingual (English/Arabic) interface with full RTL support.'),
    spacer(),
    h2('1.1 Current State'),
    bullet('Frontend is 100% complete — production-ready Next.js 16 application'),
    bullet('29 Zustand stores managing all client-side state with localStorage persistence'),
    bullet('95+ TypeScript interfaces/types covering every domain entity'),
    bullet('Pure compliance scoring engine (651 lines) with dual-track scoring'),
    bullet('Bilingual i18n with interpolation (en/ar JSON dictionaries)'),
    bullet('RBAC permission system (25 permissions × 3 roles)'),
    bullet('All data is currently seeded in-memory — no backend exists yet'),
    spacer(),
    h2('1.2 CIO Vision'),
    p('The target architecture is a multi-tenant SaaS platform where each Saudi financial institution operates in a fully isolated tenant. The backend must support Row-Level Security (RLS), per-tenant configuration, and horizontal scaling.'),
    spacer(),
    h2('1.3 Regulatory Frameworks Supported'),
    tbl(['ID', 'Framework', 'Authority'], [
      ['sama', 'SAMA BCM & Cyber Framework', 'Saudi Central Bank'],
      ['nca-ecc', 'NCA Essential Cybersecurity Controls', 'National Cybersecurity Authority'],
      ['ndmo-pdpl', 'Personal Data Protection Law', 'NDMO'],
      ['nca-cscc', 'Cloud Security Controls', 'NCA'],
      ['citc', 'CITC Telecom Regulations', 'CITC'],
      ['nca-ccc', 'Critical Infrastructure Controls', 'NCA'],
      ['cma', 'Capital Market Authority Rules', 'CMA'],
      ['zatca', 'Tax & Customs Compliance', 'ZATCA'],
      ['misa', 'Investment Authority Requirements', 'MISA'],
      ['safiu', 'Financial Intelligence Unit', 'SAFIU'],
      ['sharia-board', 'Sharia Compliance', 'Internal Sharia Board'],
    ]),
    spacer(),
    h2('1.4 Tech Stack Summary'),
    tbl(['Layer', 'Technology', 'Notes'], [
      ['Frontend', 'Next.js 16 + React 19 + TypeScript 5', 'App Router, Tailwind CSS 4, Zustand 5'],
      ['Backend (target)', 'Express.js + TypeScript', 'REST API, controller-service-repository pattern'],
      ['Database', 'Supabase (PostgreSQL 15+)', 'RLS, realtime subscriptions, storage'],
      ['Auth', 'Supabase Auth', 'JWT with custom claims (tenant_id, role)'],
      ['Queue', 'pg-boss', 'PostgreSQL-native job queue'],
      ['PDF Export', 'LaTeX (xelatex)', 'Arabic/RTL via polyglossia, Handlebars templates'],
      ['File Storage', 'Supabase Storage', 'Tenant-scoped buckets'],
      ['Hosting', 'Vercel (frontend) + Cloud Run (API)', 'Or equivalent'],
    ]),
    pb(),
  ]
}

// ── Section 2: Architecture Overview ─────────────────────────────────────────

function section2(): (Paragraph | Table)[] {
  return [
    h1('2. Architecture Overview'),
    h2('2.1 System Diagram'),
    ...codeBlock(`┌─────────────────────┐
│   Next.js Frontend  │  (Vercel)
│  Zustand → useSWR   │
└────────┬────────────┘
         │ HTTPS / REST
         ▼
┌─────────────────────┐
│   Express API       │  (Cloud Run)
│  Routes → Ctrl →    │
│  Service → Repo     │
└────────┬────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│Supabase│ │pg-boss │
│  PG 15 │ │ queue  │
│  Auth  │ └────────┘
│Storage │
└────────┘`),
    spacer(),
    h2('2.2 Tenant Flow'),
    p('Every request carries a JWT with tenant_id in the custom claims. The Express middleware extracts tenant_id and attaches it to the request context. Every database query is scoped by tenant_id — enforced by both application-level filtering AND PostgreSQL Row-Level Security policies.'),
    spacer(),
    h2('2.3 Zustand as Client-Side Cache'),
    p('The existing Zustand stores will transition from being the source of truth to being a client-side cache. Each store\'s mutation methods (create, update, delete) will call the backend API first, then update local state on success. The stores already have // TODO: Replace with actual API call placeholders marking where API calls should be inserted.'),
    spacer(),
    h2('2.4 Three-Layer API Pattern'),
    bullet('Routes — Express router definitions, validation middleware (zod), auth middleware'),
    bullet('Controllers — Parse request, call service, format response'),
    bullet('Services — Business logic, orchestration, transaction management'),
    bullet('Repositories — Database queries (Supabase client), always scoped by tenant_id'),
    spacer(),
    p('Example flow: POST /api/audits → authMiddleware → validateBody(createAuditSchema) → AuditController.create → AuditService.create → AuditRepository.insert → return 201'),
    pb(),
  ]
}

// ── Section 3: Multi-Tenancy Design ──────────────────────────────────────────

function section3(): (Paragraph | Table)[] {
  return [
    h1('3. Multi-Tenancy Design'),
    h2('3.1 Strategy: Row-Level Security'),
    p('Every data table includes a tenant_id UUID column. PostgreSQL RLS policies ensure that even if application code has a bug, one tenant can never access another tenant\'s data.'),
    spacer(),
    h2('3.2 RLS Policy Template — Top-Level Tables'),
    p('Applies to every top-level table that carries its own tenant_id column (audits, observations, risks, policies, circulars, sama_letters, frameworks, etc.):'),
    ...codeBlock(`-- Applied to every top-level data table
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON audits
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_insert ON audits
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);`),
    spacer(),
    h2('3.2.1 RLS Policy Template — Child / Junction Tables'),
    p('Many child tables (timelines, checklists, approval steps, workflow steps, version history, junction rows) intentionally OMIT a tenant_id column to avoid denormalization — they inherit tenancy from their parent via a foreign key. The Section 3.2 template will fail with column "tenant_id" does not exist on these tables. Use the parent-join variant below instead:'),
    ...codeBlock(`-- Example: observation_assignees inherits tenancy from observations
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
  ));`),
    p('Tables that use the child-table RLS template (parent in parentheses):'),
    bullet('observation_assignees, observation_checklist, observation_timeline, closure_requests, closure_reviews (observations)'),
    bullet('risk_mitigation_checklist, risk_history (risks)'),
    bullet('policy_versions, policy_workflow_steps, policy_activity_log, policy_review_cycles (policies)'),
    bullet('circular_articles, circular_workflow_steps, circular_timeline, circular_versions, circular_pending_edits (circulars)'),
    bullet('sama_letter_approval_steps, sama_letter_timeline, sama_letter_observations, sama_letter_attachments (sama_letters)'),
    bullet('advisory_notes (advisory_requests)'),
    bullet('audit_team_members (audits)'),
    bullet('framework_departments, framework_weights (frameworks)'),
    bullet('team_member_assignments, team_member_access_controls (users)'),
    bullet('employee_course_progress (training_courses + employees)'),
    bullet('message_thread_participants (message_threads)'),
    p('Implementation note: writing parent-join policies is more verbose but avoids tenant_id duplication and keeps child-row tenancy authoritative on the parent. If migration speed is preferred over normalization, an alternative is to add a denormalized tenant_id column to every child table and use the Section 3.2 template uniformly — at the cost of update triggers to keep child tenant_id in sync with the parent.'),
    spacer(),
    h2('3.3 JWT Custom Claims'),
    ...codeBlock(`{
  "sub": "user-uuid",
  "email": "user@bank.sa",
  "tenant_id": "tenant-uuid",
  "role": "compliance_officer",
  "permissions": ["audit:view", "audit:create", ...],
  "iat": 1710000000,
  "exp": 1710086400
}`),
    spacer(),
    h2('3.4 Express Middleware'),
    ...codeBlock(`// middleware/tenant.ts
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
}`),
    spacer(),
    h2('3.5 Core Tenant Tables'),
    ...codeBlock(`CREATE TABLE tenants (
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
);`),
    pb(),
  ]
}

// ── Section 4: Full Database Schema ──────────────────────────────────────────

function section4(): (Paragraph | Table)[] {
  const items: (Paragraph | Table)[] = [
    h1('4. Full Database Schema'),
    p('Top-level tables include: id UUID PK, tenant_id UUID FK → tenants(id), created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), deleted_at TIMESTAMPTZ (soft delete) — unless noted otherwise. The tenants table itself omits tenant_id and deleted_at.'),
    p('Child / junction tables (timelines, checklists, approval steps, workflow steps, version history, junction rows) intentionally OMIT tenant_id and inherit tenancy from their parent via a foreign key. These tables MUST use the parent-join RLS template defined in Section 3.2.1 — applying the Section 3.2 template will fail with column "tenant_id" does not exist. Junction tables also omit created_at/updated_at/deleted_at where noted.'),
    p('Note: The tenants and users tables are defined in Section 3.5. They are not repeated here.'),
    spacer(),
  ]

  // ── Departments ──
  items.push(h2('4.1 Departments'))
  items.push(...codeBlock(`CREATE TABLE departments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  name_ar       TEXT NOT NULL,
  is_default    BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);`))
  items.push(spacer())

  // ── Frameworks ──
  items.push(h2('4.2 Frameworks'))
  items.push(...codeBlock(`CREATE TABLE frameworks (
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
);`))
  items.push(spacer())

  // ── Audits ──
  items.push(h2('4.3 Audits'))
  items.push(...codeBlock(`CREATE TABLE audits (
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
);`))
  items.push(spacer())

  // ── Observations ──
  items.push(h2('4.4 Observations'))
  items.push(...codeBlock(`CREATE TABLE observations (
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
);`))
  items.push(spacer())

  // ── Risks ──
  items.push(h2('4.5 Risks'))
  items.push(...codeBlock(`CREATE TABLE risks (
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
);`))
  items.push(spacer())

  // ── Policies ──
  items.push(h2('4.6 Policies'))
  items.push(...codeBlock(`CREATE TABLE policies (
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
);`))
  items.push(spacer())

  // ── Circulars ──
  items.push(h2('4.7 Circulars / Regulatory Rules'))
  items.push(...codeBlock(`CREATE TABLE circulars (
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
);`))
  items.push(spacer())

  // ── SAMA Letters ──
  items.push(h2('4.8 SAMA Letters'))
  items.push(...codeBlock(`CREATE TABLE sama_letters (
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
);`))
  items.push(spacer())

  // ── Correspondence & Advisory ──
  items.push(h2('4.9 Correspondence & Advisory'))
  items.push(...codeBlock(`CREATE TABLE correspondence (
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
);`))
  items.push(spacer())

  // ── Calendar ──
  items.push(h2('4.10 Calendar Events'))
  items.push(...codeBlock(`CREATE TABLE calendar_events (
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
);`))
  items.push(spacer())

  // ── Training ──
  items.push(h2('4.11 Training'))
  items.push(...codeBlock(`CREATE TABLE training_courses (
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
);`))
  items.push(spacer())

  // ── Team & Logs ──
  items.push(h2('4.12 Team & Activity Logs'))
  items.push(...codeBlock(`CREATE TABLE team_member_assignments (
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
);`))
  items.push(spacer())

  // ── Messaging ──
  items.push(h2('4.13 Messaging'))
  items.push(...codeBlock(`CREATE TABLE message_threads (
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
);`))
  items.push(spacer())

  // ── Notifications, Reports, Templates ──
  items.push(h2('4.14 Notifications'))
  items.push(...codeBlock(`CREATE TABLE notifications (
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
);`))
  items.push(spacer())

  items.push(h2('4.15 Reports'))
  items.push(...codeBlock(`CREATE TABLE reports (
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
);`))
  items.push(spacer())

  items.push(h2('4.16 Templates'))
  items.push(...codeBlock(`CREATE TABLE audit_templates (
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
);`))
  items.push(spacer())

  // ── Settings & Scores ──
  items.push(h2('4.17 Settings & Compliance Scores'))
  items.push(...codeBlock(`CREATE TABLE compliance_settings (
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
-- This ensures the UNIQUE constraint and ON CONFLICT upsert in Section 6.6 work
-- correctly — PostgreSQL's default NULLS DISTINCT semantics would otherwise allow
-- duplicate overall-score rows per (tenant_id, period_filter).

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
);`))
  items.push(spacer())

  items.push(p('Total: 50 tables covering all 95+ TypeScript types from the frontend.'))
  items.push(pb())
  return items
}

// ── Section 5: API Endpoint Reference ────────────────────────────────────────

function section5(): (Paragraph | Table)[] {
  const items: (Paragraph | Table)[] = [
    h1('5. API Endpoint Reference'),
    p('All endpoints require Authorization: Bearer <jwt> header. All mutations are tenant-scoped via middleware. Request/response bodies use camelCase JSON. Standard error format: { error: string, details?: object }.'),
    p('Pagination: ?page=1&pageSize=20. Sorting: ?sort=createdAt&dir=desc. Filtering: ?status=open&severity=critical.'),
    spacer(),
  ]

  const endpointGroups: { title: string; endpoints: string[][] }[] = [
    {
      title: '5.1 Authentication',
      endpoints: [
        ['POST', '/api/auth/login', 'Login with email/password', '{ email, password }', '{ user, token, refreshToken }'],
        ['POST', '/api/auth/logout', 'Invalidate session', '—', '204'],
        ['POST', '/api/auth/refresh', 'Refresh JWT', '{ refreshToken }', '{ token, refreshToken }'],
        ['GET', '/api/auth/me', 'Get current user profile', '—', 'User'],
        ['PATCH', '/api/auth/me', 'Update current user profile', 'Partial<User>', 'User'],
      ],
    },
    {
      title: '5.2 Audits',
      endpoints: [
        ['GET', '/api/audits', 'List audits (paginated, filtered)', '—', '{ data: Audit[], pagination }'],
        ['GET', '/api/audits/:id', 'Get audit by ID', '—', 'Audit (with documents, team, comments)'],
        ['POST', '/api/audits', 'Create audit', 'CreateAuditDTO', 'Audit'],
        ['PATCH', '/api/audits/:id', 'Update audit', 'Partial<Audit>', 'Audit'],
        ['DELETE', '/api/audits/:id', 'Soft-delete audit', '—', '204'],
        ['POST', '/api/audits/:id/documents', 'Upload document', 'multipart/form-data', 'AuditDocument'],
        ['DELETE', '/api/audits/:id/documents/:docId', 'Remove document', '—', '204'],
        ['POST', '/api/audits/:id/team', 'Add team member', '{ userId, role }', 'AuditTeamMember'],
        ['DELETE', '/api/audits/:id/team/:memberId', 'Remove team member', '—', '204'],
        ['POST', '/api/audits/:id/comments', 'Add comment', '{ content }', 'AuditComment'],
        ['PATCH', '/api/audits/:id/comments/:cid', 'Edit comment', '{ content }', 'AuditComment'],
        ['DELETE', '/api/audits/:id/comments/:cid', 'Delete comment', '—', '204'],
      ],
    },
    {
      title: '5.3 Audit Tasks',
      endpoints: [
        ['GET', '/api/audits/:auditId/tasks', 'List tasks for audit', '—', '{ data: AuditTask[] }'],
        ['POST', '/api/audits/:auditId/tasks', 'Create task', 'CreateTaskDTO', 'AuditTask'],
        ['PATCH', '/api/audit-tasks/:id', 'Update task', 'Partial<AuditTask>', 'AuditTask'],
        ['DELETE', '/api/audit-tasks/:id', 'Delete task', '—', '204'],
        ['PATCH', '/api/audit-tasks/:id/toggle', 'Toggle completion', '{ completed }', 'AuditTask'],
      ],
    },
    {
      title: '5.4 Audit Logs',
      endpoints: [
        ['GET', '/api/audits/:auditId/logs', 'Get logs for audit', '—', '{ data: AuditLog[] }'],
        ['GET', '/api/audit-logs', 'List all audit logs (admin)', '—', '{ data: AuditLog[], pagination }'],
      ],
    },
    {
      title: '5.5 Observations',
      endpoints: [
        ['GET', '/api/observations', 'List observations', '—', '{ data: Observation[], pagination }'],
        ['GET', '/api/observations/:id', 'Get observation', '—', 'Observation (full)'],
        ['POST', '/api/observations', 'Create observation', 'CreateObsDTO', 'Observation'],
        ['PATCH', '/api/observations/:id', 'Update observation', 'Partial<Observation>', 'Observation'],
        ['DELETE', '/api/observations/:id', 'Soft-delete', '—', '204'],
        ['POST', '/api/observations/:id/comments', 'Add comment/update', '{ text }', 'ObservationUpdate'],
        ['PATCH', '/api/observations/:id/comments/:cid', 'Edit comment', '{ text }', 'ObservationUpdate'],
        ['DELETE', '/api/observations/:id/comments/:cid', 'Delete comment', '—', '204'],
        ['POST', '/api/observations/:id/checklist', 'Add checklist item', '{ text }', 'ChecklistItem'],
        ['PATCH', '/api/observations/:id/checklist/:iid', 'Edit/toggle item', '{ text?, completed? }', 'ChecklistItem'],
        ['DELETE', '/api/observations/:id/checklist/:iid', 'Delete item', '—', '204'],
        ['POST', '/api/observations/:id/documents', 'Upload document', 'multipart/form-data', 'Document'],
        ['DELETE', '/api/observations/:id/documents/:did', 'Remove document', '—', '204'],
        ['POST', '/api/observations/:id/remediation', 'Submit remediation plan', 'RemediationPlanDTO', 'RemediationPlan'],
        ['PATCH', '/api/observations/:id/remediation/review', 'Approve/reject plan', '{ approved, notes }', 'RemediationPlan'],
        ['POST', '/api/observations/:id/closure', 'Request closure', '{ notes? }', 'ClosureRequest'],
        ['PATCH', '/api/observations/:id/closure/review', 'Review closure', '{ approved, notes }', 'ClosureReview'],
        ['PATCH', '/api/observations/:id/leader', 'Transfer leadership', '{ newLeaderId }', 'Observation'],
      ],
    },
    {
      title: '5.6 Risks',
      endpoints: [
        ['GET', '/api/risks', 'List risks', '—', '{ data: Risk[], pagination }'],
        ['GET', '/api/risks/:id', 'Get risk', '—', 'Risk'],
        ['POST', '/api/risks', 'Create risk', 'CreateRiskDTO', 'Risk'],
        ['PATCH', '/api/risks/:id', 'Update risk', 'Partial<Risk>', 'Risk'],
        ['DELETE', '/api/risks/:id', 'Soft-delete', '—', '204'],
        ['POST', '/api/risks/:id/checklist', 'Add mitigation item', '{ text }', 'ChecklistItem'],
        ['PATCH', '/api/risks/:id/checklist/:iid', 'Toggle/edit item', '{ text?, completed? }', 'ChecklistItem'],
        ['DELETE', '/api/risks/:id/checklist/:iid', 'Delete item', '—', '204'],
        ['GET', '/api/risks/:id/history', 'Get risk history', '—', '{ data: RiskHistoryEntry[] }'],
      ],
    },
    {
      title: '5.7 Policies',
      endpoints: [
        ['GET', '/api/policies', 'List policies', '—', '{ data: Policy[], pagination }'],
        ['GET', '/api/policies/:id', 'Get policy (full)', '—', 'Policy'],
        ['POST', '/api/policies', 'Create policy', 'CreatePolicyDTO', 'Policy'],
        ['PATCH', '/api/policies/:id', 'Update policy', 'Partial<Policy>', 'Policy'],
        ['DELETE', '/api/policies/:id', 'Soft-delete / archive', '—', '204'],
        ['POST', '/api/policies/:id/submit-review', 'Submit for review', '—', 'Policy'],
        ['POST', '/api/policies/:id/approve', 'Approve policy', '{ notes? }', 'Policy'],
        ['POST', '/api/policies/:id/initiate-review', 'Initiate new review cycle', '—', 'Policy'],
        ['POST', '/api/policies/:id/attachments', 'Upload attachment', 'multipart/form-data', 'Attachment'],
        ['DELETE', '/api/policies/:id/attachments/:aid', 'Remove attachment', '—', '204'],
        ['POST', '/api/policies/:id/evidence', 'Upload evidence', 'multipart/form-data', 'Evidence'],
        ['DELETE', '/api/policies/:id/evidence/:eid', 'Remove evidence', '—', '204'],
        ['POST', '/api/policies/:id/workflow-steps', 'Add workflow step', '{ step, actionType }', 'WorkflowStep'],
        ['PATCH', '/api/policies/:id/workflow-steps/:sid', 'Advance/reorder step', 'Partial<Step>', 'Step'],
        ['GET', '/api/policies/review-alerts', 'Get policies needing review', '—', '{ data: Policy[] }'],
      ],
    },
    {
      title: '5.8 Circulars / Regulatory Rules',
      endpoints: [
        ['GET', '/api/circulars', 'List circulars', '—', '{ data: Circular[], pagination }'],
        ['GET', '/api/circulars/:id', 'Get circular (full)', '—', 'Circular'],
        ['POST', '/api/circulars', 'Create circular', 'CreateCircularDTO', 'Circular'],
        ['PATCH', '/api/circulars/:id', 'Update circular', 'Partial<Circular>', 'Circular'],
        ['DELETE', '/api/circulars/:id', 'Soft-delete', '—', '204'],
        ['POST', '/api/circulars/:id/articles', 'Add article', 'ArticleDTO', 'CircularArticle'],
        ['PATCH', '/api/circulars/:id/articles/:aid', 'Update article', 'Partial<Article>', 'Article'],
        ['POST', '/api/circulars/:id/workflow/advance', 'Advance workflow step', '{ notes? }', 'Circular'],
        ['POST', '/api/circulars/:id/pending-edit', 'Submit edit for approval', 'Partial<Circular>', 'PendingEdit'],
        ['PATCH', '/api/circulars/:id/pending-edit/approve', 'Approve pending edit', '{ approvalId }', 'Circular'],
        ['POST', '/api/circulars/:id/cap-attachments', 'Upload CAP attachment', 'multipart/form-data', 'Attachment'],
      ],
    },
    {
      title: '5.9 SAMA Letters',
      endpoints: [
        ['GET', '/api/sama-letters', 'List letters', '—', '{ data: SAMALetter[], pagination }'],
        ['GET', '/api/sama-letters/:id', 'Get letter', '—', 'SAMALetter'],
        ['POST', '/api/sama-letters', 'Create letter', 'CreateLetterDTO', 'SAMALetter'],
        ['PATCH', '/api/sama-letters/:id', 'Update letter', 'Partial<SAMALetter>', 'SAMALetter'],
        ['DELETE', '/api/sama-letters/:id', 'Delete letter', '—', '204'],
        ['POST', '/api/sama-letters/:id/submit', 'Submit for approval', '—', 'SAMALetter'],
        ['POST', '/api/sama-letters/:id/approve/:step', 'Approve step', '{ notes? }', 'SAMALetter'],
        ['POST', '/api/sama-letters/:id/reject/:step', 'Reject step', '{ notes }', 'SAMALetter'],
        ['POST', '/api/sama-letters/:id/send', 'Send to SAMA', '—', 'SAMALetter'],
        ['POST', '/api/sama-letters/:id/response-received', 'Mark response received', '—', 'SAMALetter'],
        ['POST', '/api/sama-letters/:id/attachments', 'Upload attachment', 'multipart/form-data', 'Attachment'],
      ],
    },
    {
      title: '5.10 Correspondence',
      endpoints: [
        ['GET', '/api/correspondence', 'List correspondence', '—', '{ data: Correspondence[], pagination }'],
        ['GET', '/api/correspondence/:id', 'Get item', '—', 'Correspondence'],
        ['POST', '/api/correspondence', 'Create', 'CreateCorrespondenceDTO', 'Correspondence'],
        ['PATCH', '/api/correspondence/:id', 'Update', 'Partial<Correspondence>', 'Correspondence'],
        ['DELETE', '/api/correspondence/:id', 'Delete', '—', '204'],
      ],
    },
    {
      title: '5.11 Advisory Requests',
      endpoints: [
        ['GET', '/api/advisory', 'List requests', '—', '{ data: AdvisoryRequest[], pagination }'],
        ['GET', '/api/advisory/:id', 'Get request', '—', 'AdvisoryRequest'],
        ['POST', '/api/advisory', 'Create request', 'CreateAdvisoryDTO', 'AdvisoryRequest'],
        ['PATCH', '/api/advisory/:id', 'Update request', 'Partial<AdvisoryRequest>', 'AdvisoryRequest'],
        ['DELETE', '/api/advisory/:id', 'Delete request', '—', '204'],
        ['POST', '/api/advisory/:id/notes', 'Add note', '{ content }', 'AdvisoryNote'],
        ['PATCH', '/api/advisory/:id/status', 'Update status', '{ status }', 'AdvisoryRequest'],
      ],
    },
    {
      title: '5.12 Calendar Events',
      endpoints: [
        ['GET', '/api/calendar', 'List events', '—', '{ data: CalendarEvent[] }'],
        ['GET', '/api/calendar/:id', 'Get event', '—', 'CalendarEvent'],
        ['POST', '/api/calendar', 'Create event', 'CreateEventDTO', 'CalendarEvent'],
        ['PATCH', '/api/calendar/:id', 'Update event', 'Partial<CalendarEvent>', 'CalendarEvent'],
        ['DELETE', '/api/calendar/:id', 'Delete event', '—', '204'],
      ],
    },
    {
      title: '5.13 Training',
      endpoints: [
        ['GET', '/api/training/courses', 'List courses', '—', '{ data: TrainingCourse[] }'],
        ['POST', '/api/training/courses', 'Create course', 'CreateCourseDTO', 'TrainingCourse'],
        ['PATCH', '/api/training/courses/:id', 'Update course', 'Partial<Course>', 'TrainingCourse'],
        ['DELETE', '/api/training/courses/:id', 'Delete course', '—', '204'],
        ['GET', '/api/training/employees', 'List employees with progress', '—', '{ data: TrainingEmployee[] }'],
        ['POST', '/api/training/employees', 'Add employee', 'CreateEmployeeDTO', 'TrainingEmployee'],
        ['PATCH', '/api/training/employees/:id/courses/:cid', 'Update progress', '{ status, progress, score }', 'CourseProgress'],
        ['GET', '/api/training/overview', 'Get overview stats', '—', 'TrainingOverviewStats'],
        ['GET', '/api/training/saudization', 'Get saudization metrics', '—', 'SaudizationMetrics'],
        ['PUT', '/api/training/saudization', 'Update saudization', 'SaudizationMetrics', 'SaudizationMetrics'],
        ['POST', '/api/training/upload', 'Upload training data CSV', 'multipart/form-data', '{ imported: number }'],
      ],
    },
    {
      title: '5.14 Team',
      endpoints: [
        ['GET', '/api/team', 'List team members', '—', '{ data: TeamMember[] }'],
        ['GET', '/api/team/:id', 'Get member', '—', 'TeamMember'],
        ['POST', '/api/team/invite', 'Invite member(s)', '{ invites: InviteDTO[] }', 'TeamMember[]'],
        ['PATCH', '/api/team/:id', 'Update member', 'Partial<TeamMember>', 'TeamMember'],
        ['DELETE', '/api/team/:id', 'Remove member', '—', '204'],
        ['PATCH', '/api/team/:id/permissions', 'Update permissions', '{ accessControls }', 'TeamMember'],
        ['POST', '/api/team/:id/unassign', 'Unassign task', '{ assignmentIndex }', 'TeamMember'],
        ['POST', '/api/team/:id/reassign', 'Reassign task', '{ from, to, taskIndex }', '{ from, to }'],
      ],
    },
    {
      title: '5.15 User Activity Logs',
      endpoints: [
        ['GET', '/api/user-logs', 'List activity logs', '—', '{ data: UserLog[], pagination }'],
      ],
    },
    {
      title: '5.16 Messages',
      endpoints: [
        ['GET', '/api/messages/threads', 'List threads', '—', '{ data: MessageThread[] }'],
        ['GET', '/api/messages/threads/:id', 'Get thread with messages', '—', '{ thread, messages }'],
        ['POST', '/api/messages/threads', 'Create thread', '{ participantIds, firstMessage }', 'MessageThread'],
        ['DELETE', '/api/messages/threads/:id', 'Delete thread', '—', '204'],
        ['POST', '/api/messages/threads/:id/messages', 'Send message', '{ content }', 'Message'],
        ['PATCH', '/api/messages/threads/:id/read', 'Mark as read', '—', '204'],
        ['POST', '/api/messages/threads/:id/members', 'Add members', '{ userIds }', 'MessageThread'],
        ['DELETE', '/api/messages/threads/:id/members/:uid', 'Remove member', '—', '204'],
      ],
    },
    {
      title: '5.17 Notifications',
      endpoints: [
        ['GET', '/api/notifications', 'List notifications', '—', '{ data: Notification[], unreadCount }'],
        ['PATCH', '/api/notifications/:id/read', 'Mark as read', '—', '204'],
        ['POST', '/api/notifications/read-all', 'Mark all as read', '—', '204'],
        ['DELETE', '/api/notifications/:id', 'Delete notification', '—', '204'],
        ['DELETE', '/api/notifications', 'Clear all', '—', '204'],
      ],
    },
    {
      title: '5.18 Reports',
      endpoints: [
        ['GET', '/api/reports', 'List reports', '—', '{ data: Report[] }'],
        ['POST', '/api/reports', 'Create/schedule report', 'CreateReportDTO', 'Report'],
        ['POST', '/api/reports/:id/generate', 'Trigger generation', '—', 'Report (status: generating)'],
        ['GET', '/api/reports/:id/download', 'Download generated report', '—', 'Binary stream'],
        ['DELETE', '/api/reports/:id', 'Delete report', '—', '204'],
      ],
    },
    {
      title: '5.19 Departments',
      endpoints: [
        ['GET', '/api/departments', 'List departments', '—', '{ data: Department[] }'],
        ['POST', '/api/departments', 'Create department', '{ name, nameAr }', 'Department'],
        ['PATCH', '/api/departments/:id', 'Update department', '{ name?, nameAr? }', 'Department'],
        ['DELETE', '/api/departments/:id', 'Delete (non-default only)', '—', '204'],
      ],
    },
    {
      title: '5.20 Frameworks',
      endpoints: [
        ['GET', '/api/frameworks', 'List framework configs', '—', '{ data: FrameworkConfig[] }'],
        ['GET', '/api/frameworks/:id', 'Get framework', '—', 'FrameworkConfig'],
        ['PATCH', '/api/frameworks/:id', 'Update config (weights, departments, threshold)', 'Partial<Config>', 'FrameworkConfig'],
        ['PATCH', '/api/frameworks/:id/toggle', 'Enable/disable', '{ enabled }', 'FrameworkConfig'],
        ['GET', '/api/frameworks/pinned', 'Get pinned frameworks (max 3)', '—', '{ data: FrameworkConfig[] }'],
        ['PATCH', '/api/frameworks/pinned', 'Update pinned list', '{ ids: string[] }', '{ pinnedIds }'],
      ],
    },
    {
      title: '5.21 Compliance Scores',
      endpoints: [
        ['GET', '/api/compliance/score', 'Get overall score', '?period=3months', 'ComplianceScoreResult'],
        ['GET', '/api/compliance/score/:frameworkId', 'Get framework score', '?period=3months', 'PerFrameworkScore'],
        ['POST', '/api/compliance/recalculate', 'Force recalculation', '—', '{ jobId }'],
      ],
    },
    {
      title: '5.22 Settings & Preferences',
      endpoints: [
        ['GET', '/api/settings/compliance', 'Get compliance settings', '—', 'ComplianceSettings'],
        ['PUT', '/api/settings/compliance', 'Update compliance settings', 'ComplianceSettings', 'ComplianceSettings'],
        ['GET', '/api/settings/preferences', 'Get user preferences', '—', 'UserPreferences'],
        ['PUT', '/api/settings/preferences', 'Update user preferences', 'UserPreferences', 'UserPreferences'],
      ],
    },
    {
      title: '5.23 Templates',
      endpoints: [
        ['GET', '/api/templates/audit', 'List audit templates', '—', '{ data: AuditTemplate[] }'],
        ['POST', '/api/templates/audit', 'Create audit template', 'AuditTemplateDTO', 'AuditTemplate'],
        ['PATCH', '/api/templates/audit/:id', 'Update template', 'Partial<AuditTemplate>', 'AuditTemplate'],
        ['DELETE', '/api/templates/audit/:id', 'Delete template', '—', '204'],
        ['GET', '/api/templates/policy', 'List policy templates', '—', '{ data: PolicyTemplate[] }'],
        ['POST', '/api/templates/policy', 'Create policy template', 'PolicyTemplateDTO', 'PolicyTemplate'],
        ['PATCH', '/api/templates/policy/:id', 'Update template', 'Partial<PolicyTemplate>', 'PolicyTemplate'],
        ['DELETE', '/api/templates/policy/:id', 'Delete template', '—', '204'],
        ['GET', '/api/templates/sama-letter', 'List SAMA letter templates', '—', '{ data: LetterTemplate[] }'],
        ['POST', '/api/templates/sama-letter', 'Create letter template', 'LetterTemplateDTO', 'LetterTemplate'],
        ['PATCH', '/api/templates/sama-letter/:id', 'Update template', 'Partial<LetterTemplate>', 'LetterTemplate'],
        ['DELETE', '/api/templates/sama-letter/:id', 'Delete template', '—', '204'],
      ],
    },
    {
      title: '5.24 Requirements',
      endpoints: [
        ['GET', '/api/requirements', 'List requirements', '—', '{ data: Requirement[], pagination }'],
        ['GET', '/api/requirements/:id', 'Get requirement', '—', 'Requirement'],
        ['POST', '/api/requirements', 'Create requirement', 'CreateRequirementDTO', 'Requirement'],
        ['PATCH', '/api/requirements/:id', 'Update', 'Partial<Requirement>', 'Requirement'],
        ['DELETE', '/api/requirements/:id', 'Delete', '—', '204'],
      ],
    },
    {
      title: '5.25 PDF Export',
      endpoints: [
        ['POST', '/api/export/pdf', 'Generate PDF via LaTeX', '{ templateId, entityId, locale }', '{ jobId }'],
        ['GET', '/api/export/pdf/:jobId', 'Download generated PDF', '—', 'Binary stream (application/pdf)'],
      ],
    },
  ]

  for (const group of endpointGroups) {
    items.push(h2(group.title))
    items.push(tbl(
      ['Method', 'Path', 'Description', 'Request Body', 'Response'],
      group.endpoints,
    ))
    items.push(spacer())
  }

  items.push(p(`Total: ~${endpointGroups.reduce((sum, g) => sum + g.endpoints.length, 0)} endpoints across ${endpointGroups.length} resource groups.`))
  items.push(pb())
  return items
}

// ── Section 6: Compliance Scoring Engine ─────────────────────────────────────

function section6(): (Paragraph | Table)[] {
  return [
    h1('6. Compliance Scoring Engine'),
    p('The scoring engine is ported directly from the frontend (src/lib/compliance-engine.ts, 651 lines). It runs on the server as a service, triggered by pg-boss jobs and cached in the compliance_scores table.'),
    spacer(),
    h2('6.1 Track A — Overall Compliance Score'),
    p('Five fixed components, each with configurable weight (summing to 100%). Weights stored in compliance_settings.weights (per-tenant). Components with "insufficient" confidence (≤2 data points) are excluded and weights renormalized.'),
    spacer(),
    tbl(['Component', 'Default Weight', 'Formula', 'Confidence Thresholds'], [
      ['Audit Completion', '25%', 'Σ(credit per audit) / count × 100. Full credit for on-time, partial for late (0.85 ≤7d, 0.70 ≤14d, 0.50 ≤30d, 0.25 >30d), 0 for incomplete.', '≤2: insufficient, ≤5: low, ≤15: moderate, >15: high'],
      ['Observation Closure', '25%', 'Σ(severity-weighted closed) / Σ(severity-weighted total) × 100. Weights: critical=4, high=2, medium=1, low=0.5', 'Same thresholds'],
      ['Risk Posture', '20%', 'Σ(likelihood×impact for resolved/accepted) / Σ(likelihood×impact all) × 100', 'Same thresholds'],
      ['Policy Currency', '15%', 'Count(approved policies with nextReviewDate > now) / Count(approved policies) × 100', 'Same thresholds'],
      ['Training Completion', '15%', 'Average of all training completionRate values', 'Same thresholds'],
    ]),
    spacer(),
    h2('6.2 Track B — Per-Framework Scores'),
    p('Each enabled framework has 7 configurable weights (stored in framework_weights: audits, observations, letters, policies, circulars, risk_posture, training — summing to 100%). Data is filtered by frameworkIds array overlap. The 7 stored weights map to 5 computed components as follows:'),
    tbl(['Component', 'Source Weight(s)', 'Calculator', 'Notes'], [
      ['Audits', 'audits', 'calcAuditCompletion', 'Filtered by frameworkIds.'],
      ['Observations', 'observations', 'calcObservationClosure', 'Filtered by frameworkIds.'],
      ['Circulars', 'circulars', 'calcCircularImplementation', 'Priority-weighted progress; filtered by frameworkIds.'],
      ['Policies', 'policies', 'calcPolicyCurrency', 'Filtered by frameworkIds.'],
      ['Tasks', 'letters + risk_posture + training', 'calcTaskScore', 'Combined weight = letters + risk_posture + training. Formula: completion×50% − overdue×30% + severity×20%. See calcPerFrameworkScore() in src/lib/compliance-engine.ts.'],
    ]),
    p('Implementation note: the 7→5 collapse keeps the per-framework calculator aligned with the simpler per-framework data model (which does not separately track letters, risk posture, or training per framework). Backend implementers MUST preserve this mapping to match the frontend engine bit-for-bit.'),
    spacer(),
    h2('6.3 Deduction Rules'),
    tbl(['Rule', 'Points', 'Severity', 'Component'], [
      ['Each critical observation open/in_progress', '-8 per obs', 'critical', 'observationClosure'],
      ['Each high observation open/in_progress', '-3 per obs', 'high', 'observationClosure'],
      ['Overdue audits', '-5 per audit', 'high', 'auditCompletion'],
      ['Late-completed audits', '-2 per audit', 'medium', 'auditCompletion'],
      ['Medium observations open', '-1 per obs', 'medium', 'observationClosure'],
      ['Insufficient data component', '-2 per component', 'low', '(varies)'],
      ['Component score < 60%', '-3 per component', 'medium', '(varies)'],
    ]),
    spacer(),
    h2('6.4 Period Filtering'),
    p('All input data is filtered by createdAt within the selected period window: 3 months, 6 months, 12 months, or fiscal year (Jan 1 – Dec 31). Change calculation compares current period vs. previous period of same duration.'),
    spacer(),
    h2('6.5 Trend Generation'),
    p('For fiscal periods: quarterly snapshots (Q1-Q4). For other periods: monthly snapshots. Each snapshot computes a partial score using cumulative data up to that point.'),
    spacer(),
    h2('6.6 Server-Side Implementation'),
    ...codeBlock(`// services/compliance-score.service.ts
export class ComplianceScoreService {
  async calculate(tenantId: string, period: PeriodFilter, frameworkId?: string) {
    // 1. Fetch all entity slices from respective repositories
    // 2. Fetch compliance_settings (weights, target)
    // 3. Fetch framework_configs (enabled frameworks + weights)
    // 4. Call calculateComplianceScore(input)
    // 5. Upsert result into compliance_scores table
    // 6. Return result
  }
}`),
    pb(),
  ]
}

// ── Section 7: Background Jobs ───────────────────────────────────────────────

function section7(): (Paragraph | Table)[] {
  return [
    h1('7. Background Jobs (pg-boss)'),
    p('pg-boss is a PostgreSQL-native job queue. All jobs are tenant-scoped. The worker process runs alongside the Express API.'),
    spacer(),
    tbl(['Job Name', 'Schedule', 'Trigger', 'Description'], [
      ['compliance.score.recalculate', 'Every 1 hour', 'Also on entity mutation events', 'Recalculates overall + per-framework compliance scores for all tenants. Upserts into compliance_scores table.'],
      ['policy.status.check', 'Daily at 02:00', '—', 'Iterates all non-draft/non-expired policies. Sets overdue if nextReviewDate < today, requires-review if ≤90 days. Increments overdueCount.'],
      ['sama.letter.overdue.check', 'Daily at 02:00', '—', 'Checks sent letters where responseDeadline < now and status is still "sent". Updates status to "overdue". Generates notification.'],
      ['audit.overdue.check', 'Daily at 02:00', '—', 'Checks audits where dueDate < today and status is pending/in_progress. Updates status to "overdue". Generates notification.'],
      ['notification.generate', 'Event-driven', 'Entity mutations', 'Generates notifications for relevant users based on entity changes (new assignment, status change, approaching deadline).'],
      ['notification.email.digest', 'Weekly (Monday 08:00)', '—', 'Aggregates unread notifications per user. Sends email digest to users with emailDigestEnabled=true.'],
      ['report.generate', 'On-demand', 'POST /api/reports/:id/generate', 'Generates PDF/Excel report asynchronously. Updates report status to "ready" and sets storage_path.'],
      ['training.overdue.check', 'Daily at 02:00', '—', 'Checks employee_course_progress where dueDate < today and status != completed. Updates to "overdue".'],
      ['circular.cap.deadline.check', 'Daily at 02:00', '—', 'Checks circulars where capDeadline < today and capStatus not in (approved, completed). Generates notification.'],
      ['burnout.detection', 'Daily at 06:00', '—', 'Runs burnout detection algorithm: counts overdue tasks, active assignments, and consecutive high-workload days per user. Updates burnoutSince timestamp.'],
    ]),
    spacer(),
    h2('7.1 Job Handler Pattern'),
    ...codeBlock(`// jobs/handlers/policy-status-check.ts
import { Job } from 'pg-boss'

export async function policyStatusCheck(job: Job) {
  const tenantIds = await tenantRepo.getAllActiveIds()
  for (const tenantId of tenantIds) {
    await setTenantContext(tenantId)
    const policies = await policyRepo.findNonTerminal(tenantId)
    const today = new Date().toISOString().split('T')[0]
    const ninetyDays = new Date(Date.now() + 90 * 86400000)
      .toISOString().split('T')[0]

    for (const policy of policies) {
      if (policy.next_review_date < today && policy.status !== 'overdue') {
        await policyRepo.update(tenantId, policy.id, {
          status: 'overdue',
          overdue_count: policy.overdue_count + 1,
          last_overdue_date: policy.next_review_date,
        })
        await notificationService.create(tenantId, {
          userId: policy.owner_id,
          title: 'Policy Overdue',
          message: \`Policy "\${policy.name}" is past its review date\`,
          type: 'warning',
          route: \`/policies?id=\${policy.id}\`,
        })
      } else if (
        policy.next_review_date <= ninetyDays &&
        policy.status === 'approved'
      ) {
        await policyRepo.update(tenantId, policy.id, {
          status: 'requires-review',
        })
        await notificationService.create(tenantId, {
          userId: policy.owner_id,
          title: 'Policy Review Due Soon',
          message: \`Policy "\${policy.name}" is within 90 days of its review date\`,
          type: 'info',
          route: \`/policies?id=\${policy.id}\`,
        })
      }
    }
  }
}`),
    pb(),
  ]
}

// ── Section 8: LaTeX PDF Generation ──────────────────────────────────────────

function section8(): (Paragraph | Table)[] {
  return [
    h1('8. LaTeX PDF Generation System'),
    h2('8.1 Architecture'),
    p('PDF generation uses LaTeX (xelatex) for professional, print-quality documents. A POST /api/export/pdf endpoint accepts a template ID and entity ID, renders a Handlebars → .tex template, compiles to PDF, and stores the result in Supabase Storage.'),
    spacer(),
    ...codeBlock(`Client → POST /api/export/pdf { templateId, entityId, locale }
     → ExportService.generate()
       → Fetch entity data from DB
       → Render Handlebars template → .tex file
       → Execute: xelatex -interaction=nonstopmode output.tex
       → Upload PDF to Supabase Storage
       → Return { jobId, downloadUrl }`),
    spacer(),
    h2('8.2 Server Setup'),
    p('LaTeX must be installed on the server. For Docker deployments:'),
    ...codeBlock(`# Dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y \\
    texlive-xetex \\
    texlive-fonts-recommended \\
    texlive-fonts-extra \\
    texlive-lang-arabic \\
    fonts-noto \\
    fonts-noto-cjk \\
    && rm -rf /var/lib/apt/lists/*`),
    spacer(),
    h2('8.3 Security — LaTeX Input Sanitization'),
    p('LaTeX special characters must be escaped to prevent injection:'),
    ...codeBlock(`const LATEX_SPECIAL = /[&%$#_{}~^\\\\]/g
const ESCAPE_MAP: Record<string, string> = {
  '&': '\\\\&', '%': '\\\\%', '$': '\\\\$', '#': '\\\\#',
  '_': '\\\\_', '{': '\\\\{', '}': '\\\\}', '~': '\\\\textasciitilde{}',
  '^': '\\\\textasciicircum{}', '\\\\': '\\\\textbackslash{}',
}

function sanitizeLatex(input: string): string {
  return input.replace(LATEX_SPECIAL, (char) => ESCAPE_MAP[char] || char)
}`),
    spacer(),
    h2('8.4 Template Engine'),
    p('Templates use Handlebars with a .tex extension. Directory structure:'),
    ...codeBlock(`templates/
  latex/
    common/
      header.tex        # \\documentclass, packages, fonts
      footer.tex        # \\end{document}
      logo.tex          # Company logo inclusion
    audit-report.tex
    observation-report.tex
    risk-register.tex
    policy-document.tex
    sama-letter.tex
    compliance-scorecard.tex
    training-report.tex
    fallback.tex        # Generic entity export`),
    spacer(),
    h2('8.5 Template List'),
    tbl(['Template', 'Entity', 'Key Data'], [
      ['audit-report.tex', 'Audit', 'Title, type, status, progress, team, documents, comments, tasks'],
      ['observation-report.tex', 'Observation', 'Title, severity, status, checklist, remediation, timeline'],
      ['risk-register.tex', 'Risk (batch)', 'All risks with scores, mitigation status, heat map'],
      ['policy-document.tex', 'Policy', 'Name, version, workflow, attachments, activity log'],
      ['sama-letter.tex', 'SAMA Letter', 'Bilingual body, approval chain, signer block, attachments'],
      ['compliance-scorecard.tex', 'Score Result', 'Overall score, components, deductions, trend chart (pgfplots)'],
      ['training-report.tex', 'Training', 'Courses, employees, saudization, department breakdown'],
      ['fallback.tex', 'Any entity', 'JSON-to-table generic renderer'],
    ]),
    spacer(),
    h2('8.6 Arabic/RTL Path'),
    p('For Arabic documents, use xelatex with polyglossia:'),
    ...codeBlock(`\\usepackage{polyglossia}
\\setmainlanguage{arabic}
\\setotherlanguage{english}
\\newfontfamily\\arabicfont{Noto Naskh Arabic}[Script=Arabic]
\\newfontfamily\\englishfont{Noto Sans}

% Bilingual section example
\\begin{Arabic}
{{subjectAr}}
\\end{Arabic}

\\begin{english}
{{subjectEn}}
\\end{english}`),
    spacer(),
    h2('8.7 Frontend Integration'),
    p('The existing ExportModal component on the frontend will call POST /api/export/pdf, poll for completion via GET /api/export/pdf/:jobId (or use WebSocket), and then trigger browser download.'),
    spacer(),
    h2('8.8 Implementation Checklist'),
    bullet('Phase 1: Install LaTeX on server, create Handlebars→.tex pipeline, implement sanitization'),
    bullet('Phase 2: Build 3 core templates (SAMA letter, audit report, compliance scorecard)'),
    bullet('Phase 3: Build remaining 4 templates + fallback'),
    bullet('Phase 4: Add pgfplots chart generation for compliance scorecard trend graphs'),
    pb(),
  ]
}

// ── Section 9: Auth & RBAC ───────────────────────────────────────────────────

function section9(): (Paragraph | Table)[] {
  return [
    h1('9. Authentication & Role-Based Access Control'),
    h2('9.1 Auth Flow'),
    bullet('User logs in with email/password via Supabase Auth'),
    bullet('Supabase returns JWT with custom claims (tenant_id, role, permissions)'),
    bullet('Frontend stores JWT, sends as Authorization: Bearer header'),
    bullet('Backend middleware validates JWT, extracts tenant_id, sets RLS context'),
    spacer(),
    h2('9.2 Role Mapping'),
    p('The frontend uses officer/manager/admin. The backend introduces a fourth read-only role (viewer) for stakeholders that should not mutate observations:'),
    tbl(['Frontend Role', 'Backend Role', 'Description'], [
      ['officer (default)', 'auditor', 'View-only across modules + FULL observation access (create, edit, comment). This is the default backend role assigned when a frontend officer is provisioned.'],
      ['officer (read-only)', 'viewer', 'View-only across all modules including observations. Cannot mutate any data. Provisioned only when explicitly requested via the team-invite "Read-only stakeholder" toggle.'],
      ['manager', 'compliance_officer', 'Can create, edit, comment, export. Cannot delete or manage settings.'],
      ['admin', 'org_admin', 'Full access including delete, settings, team management.'],
    ]),
    p('Provisioning rule: POST /api/team/invite with role=officer creates a backend user with role=auditor by default. If the invite payload sets readOnly=true, the backend user is created with role=viewer instead. This decision is one-way at provisioning time; changing later requires an admin to edit the user record.'),
    spacer(),
    h2('9.3 Permission Matrix'),
    p('Derived from src/lib/rbac/permissions.ts (25 permissions × 4 backend roles). Viewer is strictly read-only; auditor adds observation create/edit/comment to match the frontend officer role:'),
    tbl(['Permission', 'Viewer', 'Auditor', 'Manager', 'Admin'], [
      ['view', '✓', '✓', '✓', '✓'],
      ['comment', '—', '✓', '✓', '✓'],
      ['create', '—', '—', '✓', '✓'],
      ['edit', '—', '—', '✓', '✓'],
      ['delete', '—', '—', '—', '✓'],
      ['audit:view', '✓', '✓', '✓', '✓'],
      ['audit:comment', '—', '—', '✓', '✓'],
      ['audit:create', '—', '—', '✓', '✓'],
      ['audit:edit', '—', '—', '✓', '✓'],
      ['audit:delete', '—', '—', '—', '✓'],
      ['observation:view', '✓', '✓', '✓', '✓'],
      ['observation:comment', '—', '✓', '✓', '✓'],
      ['observation:create', '—', '✓', '✓', '✓'],
      ['observation:edit', '—', '✓', '✓', '✓'],
      ['observation:delete', '—', '—', '—', '✓'],
      ['report:view', '✓', '✓', '✓', '✓'],
      ['report:create', '—', '—', '✓', '✓'],
      ['report:delete', '—', '—', '—', '✓'],
      ['export', '✓', '✓', '✓', '✓'],
      ['settings:view', '—', '—', '—', '✓'],
      ['settings:edit', '—', '—', '—', '✓'],
      ['team:view', '—', '—', '—', '✓'],
      ['team:invite', '—', '—', '—', '✓'],
      ['team:edit', '—', '—', '—', '✓'],
      ['team:remove', '—', '—', '—', '✓'],
    ]),
    spacer(),
    h2('9.4 Express Permission Middleware'),
    ...codeBlock(`// middleware/authorize.ts
export function authorize(...requiredPermissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userRole = req.userRole
    const userPermissions = ROLE_PERMISSIONS[userRole] || []
    const customPermissions = req.userPermissions || []
    const allPermissions = new Set([...userPermissions, ...customPermissions])

    const hasAll = requiredPermissions.every(p => allPermissions.has(p))
    if (!hasAll) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: requiredPermissions,
      })
    }
    next()
  }
}

// Usage in routes:
router.post('/api/audits', authorize('audit:create'), AuditController.create)
router.delete('/api/audits/:id', authorize('audit:delete'), AuditController.delete)`),
    spacer(),
    h2('9.5 Observation-Specific Permissions'),
    p('Observations have role-based AND ownership-based permissions. The backend must check:'),
    bullet('Leader permissions: creator or transferred leader can manage, transfer, edit'),
    bullet('Assignee permissions: can submit remediation, upload documents, request closure'),
    bullet('Closure review: only leader or manager/admin can approve/reject closure'),
    bullet('Comment ownership: users can edit/delete own comments; manager+ can edit any'),
    ...codeBlock(`// services/observation.service.ts — example check
async submitRemediation(tenantId, obsId, userId, plan) {
  const obs = await this.repo.findById(tenantId, obsId)
  const isLeader = obs.leader_id === userId
  const isAssignee = await this.repo.isAssignee(obsId, userId)
  if (!isLeader && !isAssignee) {
    throw new ForbiddenError('Only leader or assignee can submit remediation')
  }
  // ... proceed
}`),
    pb(),
  ]
}

// ── Section 10: Framework Versioning ─────────────────────────────────────────

function section10(): (Paragraph | Table)[] {
  return [
    h1('10. Framework Versioning'),
    h2('10.1 Version Schema'),
    p('The frameworks table includes version (TEXT) and is_active (BOOLEAN). When a regulatory body publishes a new version of their framework, a new row is inserted with the new version and is_active=true. The old version is set to is_active=false.'),
    spacer(),
    ...codeBlock(`-- Example: SAMA updates from v1.0 to v2.0
BEGIN;
  UPDATE frameworks SET is_active = false
    WHERE tenant_id = $1 AND regulatory_body_id = 'sama' AND version = '1.0';

  INSERT INTO frameworks (tenant_id, regulatory_body_id, name, version, is_active, ...)
    VALUES ($1, 'sama', 'SAMA BCM v2.0', '2.0', true, ...);
COMMIT;`),
    spacer(),
    h2('10.2 Migration Tracking'),
    ...codeBlock(`CREATE TABLE framework_version_migrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  from_framework_id UUID NOT NULL REFERENCES frameworks(id),
  to_framework_id   UUID NOT NULL REFERENCES frameworks(id),
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  migrated_entities JSONB DEFAULT '{}',
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);`),
    spacer(),
    h2('10.3 Historical Data Preservation'),
    p('Entities (audits, observations, policies, etc.) reference framework IDs via the framework_ids TEXT[] column. Since this stores the framework ID (not version), historical data naturally preserves its framework association. The compliance_scores table stores cached scores per framework per period — old scores remain queryable.'),
    spacer(),
    h2('10.4 Version Bump Workflow'),
    bullet('1. Admin receives notification of new framework version from regulatory body'),
    bullet('2. Admin triggers "Upgrade Framework" in settings'),
    bullet('3. Backend creates new framework row, copies department assignments and weights'),
    bullet('4. Background job updates framework_ids on entities tagged with old version (optional — depends on org preference)'),
    bullet('5. Compliance scores are recalculated with new framework config'),
    pb(),
  ]
}

// ── Section 11: Developer Handoff Checklist ──────────────────────────────────

function section11(): (Paragraph | Table)[] {
  return [
    h1('11. Developer Handoff Checklist'),
    p('Follow this order for backend implementation:'),
    spacer(),
    tbl(['#', 'Task', 'Dependencies', 'Notes'], [
      ['1', 'Supabase project setup', '—', 'Create project, enable Auth, configure Storage buckets'],
      ['2', 'Run database migrations', 'Step 1', 'Execute all CREATE TABLE statements from Section 4'],
      ['3', 'Enable RLS on all tables', 'Step 2', 'Apply Section 3.2 template to top-level tables (tenant_id column present); apply Section 3.2.1 parent-join template to child / junction tables (tenant_id absent)'],
      ['4', 'Express API scaffold', '—', 'TypeScript, controller-service-repository structure, error handling'],
      ['5', 'Auth middleware + tenant context', 'Steps 1, 4', 'JWT validation, RLS context setting per Section 3.4'],
      ['6', 'RBAC middleware', 'Step 5', 'Permission checking per Section 9.4'],
      ['7', 'CRUD routes for all entities', 'Steps 4-6', '~160 endpoints per Section 5. Start with audits, observations, risks'],
      ['8', 'Compliance scoring service', 'Step 7', 'Port engine from frontend per Section 6'],
      ['9', 'pg-boss worker setup', 'Steps 7-8', '10 jobs per Section 7. Start with score recalculation and overdue checks'],
      ['10', 'LaTeX PDF generation', 'Step 7', 'Install texlive, build templates per Section 8'],
      ['11', 'Frontend API integration', 'Steps 7-10', 'Replace Zustand TODO placeholders with fetch/mutate calls'],
      ['12', 'E2E testing + load testing', 'Steps 1-11', 'Multi-tenant isolation tests, concurrent user simulation'],
    ]),
    spacer(),
    h2('11.1 Required Environment Variables'),
    ...codeBlock(`# Supabase
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
NODE_ENV=production`),
    spacer(),
    p('End of specification document. This document covers the complete backend requirements for ComplianceOS v1. For questions, refer to the frontend source code in the complianceos-app/ directory.'),
  ]
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const children = [
    // Title page
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 200 },
      children: [new TextRun({ text: 'ComplianceOS', bold: true, font: FONT, size: 52, color: BLUE })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: 'Backend Requirements & Architecture Specification', font: FONT, size: 32, color: BLUE })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: 'Version 1.0', font: FONT, size: 24, color: '666666' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: `Generated: ${new Date().toISOString().split('T')[0]}`, font: FONT, size: 22, color: '666666' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
      children: [new TextRun({ text: 'Confidential — For Internal Engineering Use Only', font: FONT, size: 20, color: '999999', italics: true })],
    }),
    pb(),

    // Sections
    ...section1(),
    ...section2(),
    ...section3(),
    ...section4(),
    ...section5(),
    ...section6(),
    ...section7(),
    ...section8(),
    ...section9(),
    ...section10(),
    ...section11(),
  ]

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  const outputPath = path.join(process.cwd(), 'docs', 'ComplianceOS-Backend-Requirements-v1.docx')
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, buffer)
  console.log(`✅ Generated: ${outputPath}`)
  console.log(`   Size: ${(buffer.length / 1024).toFixed(1)} KB`)
}

main().catch((err) => {
  console.error('❌ Generation failed:', err)
  process.exit(1)
})
