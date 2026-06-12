// /api/calendar/deadlines — server-side aggregation of SUB-ITEM deadlines.
//
// The calendar's client hook (useCalendarEvents) can only see list-store data,
// so it surfaces top-level entity deadlines (audit/observation due dates,
// policy review dates, risk review/mitigation dates, letter response deadlines,
// …). Sub-item deadlines live in detail-only child tables and never reach the
// client. This route unions those child tables directly — each row carries its
// parent's title + a deep-link — so the calendar can be the single source of
// truth for EVERY deadline, with click-through to the parent.
//
// Sources: risk mitigation-checklist items, policy workflow steps, circular
// workflow steps, audit tasks, observation remediation plans, and circular
// CAP-response / remediation deadlines.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mirror of UnifiedCalendarItem (src/types) — title = the sub-item, subtitle =
// the parent it's derived from, route = deep-link to that parent.
type DerivedSource = 'risk' | 'policy' | 'circular' | 'audit' | 'observation'
interface DerivedItem {
  id: string
  sourceType: DerivedSource
  title: string
  subtitle: string
  date: string
  status: string
  route: string
  colorKey: DerivedSource
  done: boolean
  kind?: 'checklist' | 'step' | 'task' | 'remediation'
  parentTitle: string
}

function ymd(d: string | null | undefined): string | null {
  if (!d) return null
  const s = String(d).substring(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

// Supabase types a to-one embed as either an object or a 1-element array
// depending on how it infers the relationship; normalize both.
function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

const LIMIT = 1000

export async function GET(_req: NextRequest) {
  try {
    const { supabase } = await requireUser()

    const [riskCl, polSteps, circSteps, auditTasks, remPlans, obsCl, circArtCl, circs] = await Promise.all([
      supabase
        .from('risk_mitigation_checklist')
        .select('id, text, deadline, completed, risks(id, title, status)')
        .not('deadline', 'is', null)
        .limit(LIMIT),
      supabase
        .from('policy_workflow_steps')
        .select('id, step, deadline, status, policies(id, ref_code, name)')
        .not('deadline', 'is', null)
        .limit(LIMIT),
      supabase
        .from('circular_workflow_steps')
        .select('id, label, deadline, status, circulars(id, title)')
        .not('deadline', 'is', null)
        .limit(LIMIT),
      supabase
        .from('audit_tasks')
        .select('id, title, due_date, status, audits(id, title)')
        .not('due_date', 'is', null)
        .limit(LIMIT),
      supabase
        .from('remediation_plans')
        .select('id, title, due_date, status, observations(id, title)')
        .not('due_date', 'is', null)
        .limit(LIMIT),
      supabase
        .from('observation_checklist')
        .select('id, text, deadline, completed, observations(id, title)')
        .not('deadline', 'is', null)
        .limit(LIMIT),
      // Task D / #32: circular ARTICLE checklist-item deadlines. Join up two
      // levels: article_checklist_items → circular_articles → circulars.
      supabase
        .from('article_checklist_items')
        .select('id, text, deadline, completed, circular_articles(id, circulars(id, title))')
        .not('deadline', 'is', null)
        .limit(LIMIT),
      supabase
        .from('circulars')
        .select('id, title, status, cap_response_deadline, remediation_deadline')
        .limit(LIMIT),
    ])

    const items: DerivedItem[] = []

    // Risk mitigation-checklist item deadlines.
    for (const r of (riskCl.data ?? []) as Array<Record<string, unknown>>) {
      const date = ymd(r.deadline as string)
      const parent = one(r.risks as { id: string; title: string; status: string })
      if (!date || !parent) continue
      items.push({
        id: `risk-cl-${r.id as string}`,
        sourceType: 'risk',
        title: (r.text as string) || 'Checklist item',
        subtitle: parent.title,
        parentTitle: parent.title,
        kind: 'checklist',
        done: Boolean(r.completed),
        date,
        status: (r.completed as boolean) ? 'completed' : 'pending',
        route: `/reports/risks?id=${parent.id}`,
        colorKey: 'risk',
      })
    }

    // Policy workflow-step deadlines.
    for (const s of (polSteps.data ?? []) as Array<Record<string, unknown>>) {
      const date = ymd(s.deadline as string)
      const parent = one(s.policies as { id: string; ref_code: string | null; name: string })
      if (!date || !parent) continue
      items.push({
        id: `policy-step-${s.id as string}`,
        sourceType: 'policy',
        title: (s.step as string) || 'Workflow step',
        subtitle: parent.name,
        parentTitle: parent.name,
        kind: 'step',
        done: (s.status as string) === 'completed',
        date,
        status: (s.status as string) || 'pending',
        route: `/correspondence/regulatory-updates/policies?policyId=${parent.ref_code ?? parent.id}`,
        colorKey: 'policy',
      })
    }

    // Circular workflow-step deadlines.
    for (const s of (circSteps.data ?? []) as Array<Record<string, unknown>>) {
      const date = ymd(s.deadline as string)
      const parent = one(s.circulars as { id: string; title: string })
      if (!date || !parent) continue
      items.push({
        id: `circ-step-${s.id as string}`,
        sourceType: 'circular',
        title: (s.label as string) || 'Workflow step',
        subtitle: parent.title,
        parentTitle: parent.title,
        kind: 'step',
        done: (s.status as string) === 'completed',
        date,
        status: (s.status as string) || 'pending',
        route: `/correspondence/regulatory-updates/rules?id=${parent.id}`,
        colorKey: 'circular',
      })
    }

    // Audit task deadlines.
    for (const tsk of (auditTasks.data ?? []) as Array<Record<string, unknown>>) {
      const date = ymd(tsk.due_date as string)
      const parent = one(tsk.audits as { id: string; title: string })
      if (!date || !parent) continue
      items.push({
        id: `audit-task-${tsk.id as string}`,
        sourceType: 'audit',
        title: (tsk.title as string) || 'Audit task',
        subtitle: parent.title,
        parentTitle: parent.title,
        kind: 'task',
        done: (tsk.status as string) === 'completed',
        date,
        status: (tsk.status as string) || 'pending',
        route: `/reports/${parent.id}`,
        colorKey: 'audit',
      })
    }

    // Observation remediation-plan submission deadlines.
    for (const p of (remPlans.data ?? []) as Array<Record<string, unknown>>) {
      const date = ymd(p.due_date as string)
      const parent = one(p.observations as { id: string; title: string })
      if (!date || !parent) continue
      items.push({
        id: `rem-plan-${p.id as string}`,
        sourceType: 'observation',
        title: (p.title as string) || 'Remediation plan',
        subtitle: parent.title,
        parentTitle: parent.title,
        kind: 'remediation',
        done: (p.status as string) === 'approved',
        date,
        status: (p.status as string) || 'pending',
        route: `/correspondence/observations?id=${parent.id}`,
        colorKey: 'observation',
      })
    }

    // Observation checklist-item deadlines.
    for (const cl of (obsCl.data ?? []) as Array<Record<string, unknown>>) {
      const date = ymd(cl.deadline as string)
      const parent = one(cl.observations as { id: string; title: string })
      if (!date || !parent) continue
      items.push({
        id: `obs-cl-${cl.id as string}`,
        sourceType: 'observation',
        title: (cl.text as string) || 'Checklist item',
        subtitle: parent.title,
        parentTitle: parent.title,
        kind: 'checklist',
        done: Boolean(cl.completed),
        date,
        status: (cl.completed as boolean) ? 'completed' : 'pending',
        route: `/correspondence/observations?id=${parent.id}`,
        colorKey: 'observation',
      })
    }

    // Circular ARTICLE checklist-item deadlines (Task D / #32). The parent
    // circular is reached through the article: item → circular_articles →
    // circulars. Skip rows missing a date or a resolvable parent circular.
    for (const cl of (circArtCl.data ?? []) as Array<Record<string, unknown>>) {
      const date = ymd(cl.deadline as string)
      const article = one(cl.circular_articles as { id: string; circulars: unknown })
      const parent = article
        ? one(article.circulars as { id: string; title: string })
        : null
      if (!date || !parent) continue
      items.push({
        id: `circ-article-cl-${cl.id as string}`,
        sourceType: 'circular',
        title: (cl.text as string) || 'Checklist item',
        subtitle: parent.title,
        parentTitle: parent.title,
        kind: 'checklist',
        done: Boolean(cl.completed),
        date,
        status: (cl.completed as boolean) ? 'completed' : 'pending',
        route: `/correspondence/regulatory-updates/rules?id=${parent.id}`,
        colorKey: 'circular',
      })
    }

    // Circular CAP-response + remediation deadlines (top-level circular fields
    // not surfaced by the client hook).
    for (const c of (circs.data ?? []) as Array<Record<string, unknown>>) {
      const cid = c.id as string
      const status = (c.status as string) || 'pending'
      const done = status === 'completed'
      const capResp = ymd(c.cap_response_deadline as string)
      if (capResp) {
        items.push({
          id: `circ-capresp-${cid}`,
          sourceType: 'circular',
          title: `${c.title as string} — CAP response`,
          subtitle: c.title as string,
          parentTitle: c.title as string,
          done,
          date: capResp,
          status,
          route: `/correspondence/regulatory-updates/rules?id=${cid}`,
          colorKey: 'circular',
        })
      }
      const remDl = ymd(c.remediation_deadline as string)
      if (remDl) {
        items.push({
          id: `circ-rem-${cid}`,
          sourceType: 'circular',
          title: `${c.title as string} — Remediation`,
          subtitle: c.title as string,
          parentTitle: c.title as string,
          done,
          date: remDl,
          status,
          route: `/correspondence/regulatory-updates/rules?id=${cid}`,
          colorKey: 'circular',
        })
      }
    }

    // Entity reads must be no-store (deadlines change with every sub-item edit).
    return ok(items, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
