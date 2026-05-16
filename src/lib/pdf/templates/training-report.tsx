// Template: Training report — per-employee course-progress status.

import React from 'react'
import { z } from 'zod'
import {
  Document,
  ReportPage,
  CoverPage,
  SubHeading,
  DataTable,
  StatusBadge,
} from '../base'
import type { PdfTemplate } from '../types'

const EmployeeProgressSchema = z.object({
  employee: z.string(),
  department: z.string().optional(),
  course: z.string(),
  status: z.string().default('not_started'),
  progress: z.number().min(0).max(100).optional(),
  dueDate: z.string().optional(),
  completedAt: z.string().optional(),
})

const TrainingReportDataSchema = z.object({
  organization: z.string(),
  generatedBy: z.string(),
  date: z.string(),
  subtitle: z.string().optional(),
  rows: z.array(EmployeeProgressSchema).default([]),
})

export type TrainingReportData = z.infer<typeof TrainingReportDataSchema>

function counts(rows: TrainingReportData['rows']) {
  const c = { not_started: 0, in_progress: 0, completed: 0, overdue: 0 }
  for (const r of rows) {
    const k = r.status?.toLowerCase()?.replace(/[\s-]/g, '_') as keyof typeof c
    if (k in c) c[k]++
  }
  return c
}

export const trainingReportTemplate: PdfTemplate<TrainingReportData> = {
  key: 'training-report',
  schema: TrainingReportDataSchema,
  Component: ({ data, locale }) => {
    const c = counts(data.rows)
    return (
      <Document title="Training Report">
        <CoverPage
          title={locale === 'ar' ? 'تقرير التدريب' : 'Training Report'}
          subtitle={data.subtitle}
          organization={data.organization}
          generatedBy={data.generatedBy}
          date={data.date}
          locale={locale}
        />
        <ReportPage
          locale={locale}
          title={locale === 'ar' ? 'تقرير التدريب' : 'Training Report'}
          organization={data.organization}
        >
          <SubHeading locale={locale}>
            {locale === 'ar' ? 'الملخص' : 'Summary'}
          </SubHeading>
          <DataTable
            locale={locale}
            rows={[c]}
            columns={[
              { header: locale === 'ar' ? 'لم يبدأ' : 'Not started', cell: (r) => r.not_started, align: 'center' },
              { header: locale === 'ar' ? 'جارٍ' : 'In progress',   cell: (r) => r.in_progress, align: 'center' },
              { header: locale === 'ar' ? 'مكتمل' : 'Completed',     cell: (r) => r.completed, align: 'center' },
              { header: locale === 'ar' ? 'متأخر' : 'Overdue',       cell: (r) => r.overdue, align: 'center' },
            ]}
          />

          <SubHeading locale={locale}>
            {locale === 'ar' ? 'تفاصيل' : 'Detail'}
          </SubHeading>
          <DataTable
            locale={locale}
            rows={data.rows}
            columns={[
              { header: locale === 'ar' ? 'الموظف' : 'Employee', cell: (r) => r.employee, flex: 2 },
              { header: locale === 'ar' ? 'القسم' : 'Dept', cell: (r) => r.department ?? '—', flex: 1 },
              { header: locale === 'ar' ? 'الدورة' : 'Course', cell: (r) => r.course, flex: 2 },
              {
                header: locale === 'ar' ? 'الحالة' : 'Status',
                cell: (r) => <StatusBadge status={r.status} />,
                flex: 1,
              },
              {
                header: '%',
                cell: (r) => (r.progress !== undefined ? `${Math.round(r.progress)}%` : '—'),
                flex: 1,
                align: 'right',
              },
              { header: locale === 'ar' ? 'الاستحقاق' : 'Due', cell: (r) => r.dueDate ?? '—', flex: 1 },
              { header: locale === 'ar' ? 'الإكمال' : 'Completed', cell: (r) => r.completedAt ?? '—', flex: 1 },
            ]}
          />
        </ReportPage>
      </Document>
    )
  },
}
