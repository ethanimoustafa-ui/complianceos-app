// W50 — plain-text PDF export of an archived audit cycle (owner: "it doesn't
// have to look nice now"). Layout polish deferred with the other PDF work.

import { jsPDF } from 'jspdf'
import type { AuditCycleDetail } from '@/stores/audit-store'

export function generateAuditCyclePdf(cycle: AuditCycleDetail, auditTitle: string) {
  const doc = new jsPDF()
  const line = { y: 14 }
  const write = (text: string, opts?: { size?: number; bold?: boolean; gap?: number }) => {
    if (line.y > 280) {
      doc.addPage()
      line.y = 14
    }
    doc.setFontSize(opts?.size ?? 10)
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
    const wrapped = doc.splitTextToSize(text, 180)
    doc.text(wrapped, 14, line.y)
    line.y += wrapped.length * 5 + (opts?.gap ?? 2)
  }

  const snap = cycle.snapshot
  const audit = snap.audit as Record<string, unknown>

  write(`Audit Report — ${auditTitle}`, { size: 16, bold: true, gap: 4 })
  write(`Cycle #${cycle.cycleNumber} · closed ${new Date(cycle.closedAt).toLocaleString('en-US')}`, { size: 11, gap: 4 })
  write(`Status: ${cycle.status ?? '-'}   Progress: ${cycle.progress}%   Due: ${cycle.dueDate ?? '-'}`, { gap: 6 })
  if (audit.description) write(`Scope: ${String(audit.description)}`, { gap: 6 })

  write(`Checklist (${snap.tasks.length})`, { size: 13, bold: true, gap: 3 })
  for (const t of snap.tasks) {
    const r = t as { title?: string; completed?: boolean; due_date?: string }
    write(`${r.completed ? '[x]' : '[ ]'} ${r.title ?? '-'}${r.due_date ? ` (due ${r.due_date})` : ''}`)
  }
  if (snap.tasks.length === 0) write('— none —')

  write(`Documents (${snap.documents.length})`, { size: 13, bold: true, gap: 3 })
  for (const d of snap.documents) {
    const r = d as { name?: string; uploaded_at?: string }
    write(`• ${r.name ?? '-'}${r.uploaded_at ? ` (${r.uploaded_at.slice(0, 10)})` : ''}`)
  }
  if (snap.documents.length === 0) write('— none —')

  write(`Comments (${snap.comments.length})`, { size: 13, bold: true, gap: 3 })
  for (const c of snap.comments) {
    const r = c as { content?: string; created_at?: string; author_name?: string | null }
    write(`• ${r.created_at ? `[${r.created_at.slice(0, 10)}] ` : ''}${r.author_name ? `${r.author_name}: ` : ''}${r.content ?? ''}`)
  }
  if (snap.comments.length === 0) write('— none —')

  write(`Activity (${snap.logs.length})`, { size: 13, bold: true, gap: 3 })
  for (const l of snap.logs.slice(0, 40)) {
    const r = l as { timestamp?: string; user_name?: string; action?: string }
    write(`• ${r.timestamp ? r.timestamp.slice(0, 16).replace('T', ' ') : ''} — ${r.user_name ?? ''} — ${r.action ?? ''}`)
  }
  if (snap.logs.length === 0) write('— none —')

  doc.save(`audit-${auditTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-cycle-${cycle.cycleNumber}.pdf`)
}
