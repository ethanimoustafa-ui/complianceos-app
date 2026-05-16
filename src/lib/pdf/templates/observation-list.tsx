// Template: Observation list — severity-grouped tabular export.

import React from 'react'
import { z } from 'zod'
import {
  Document,
  ReportPage,
  CoverPage,
  SubHeading,
  DataTable,
  SeverityBadge,
  StatusBadge,
} from '../base'
import type { PdfTemplate } from '../types'

const ObservationSchema = z.object({
  reference: z.string().optional(),
  title: z.string(),
  severity: z.string().default('low'),
  source: z.string().optional(),
  status: z.string().default('open'),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
})

const ObservationListDataSchema = z.object({
  organization: z.string(),
  generatedBy: z.string(),
  date: z.string(),
  subtitle: z.string().optional(),
  observations: z.array(ObservationSchema).default([]),
})

export type ObservationListData = z.infer<typeof ObservationListDataSchema>

function counts(items: ObservationListData['observations']) {
  const c = { critical: 0, high: 0, medium: 0, low: 0, open: 0, overdue: 0 }
  for (const o of items) {
    const s = o.severity.toLowerCase() as keyof typeof c
    if (s in c) c[s]++
    if (o.status?.toLowerCase() === 'open') c.open++
    if (o.status?.toLowerCase() === 'overdue') c.overdue++
  }
  return c
}

export const observationListTemplate: PdfTemplate<ObservationListData> = {
  key: 'observation-list',
  schema: ObservationListDataSchema,
  Component: ({ data, locale }) => {
    const c = counts(data.observations)
    return (
      <Document title="Observations">
        <CoverPage
          title={locale === 'ar' ? 'الملاحظات' : 'Observations Report'}
          subtitle={data.subtitle}
          organization={data.organization}
          generatedBy={data.generatedBy}
          date={data.date}
          locale={locale}
        />
        <ReportPage
          locale={locale}
          title={locale === 'ar' ? 'الملاحظات' : 'Observations'}
          organization={data.organization}
        >
          <SubHeading locale={locale}>
            {locale === 'ar' ? 'ملخص تنفيذي' : 'Executive Summary'}
          </SubHeading>
          <DataTable
            locale={locale}
            rows={[
              { k: locale === 'ar' ? 'الإجمالي' : 'Total',     v: data.observations.length },
              { k: locale === 'ar' ? 'حرجة' : 'Critical',      v: c.critical },
              { k: locale === 'ar' ? 'عالية' : 'High',         v: c.high },
              { k: locale === 'ar' ? 'متوسطة' : 'Medium',      v: c.medium },
              { k: locale === 'ar' ? 'منخفضة' : 'Low',         v: c.low },
              { k: locale === 'ar' ? 'مفتوحة' : 'Open',        v: c.open },
              { k: locale === 'ar' ? 'متأخرة' : 'Overdue',     v: c.overdue },
            ]}
            columns={[
              { header: locale === 'ar' ? 'القياس' : 'Metric', cell: (r) => r.k, flex: 2 },
              { header: locale === 'ar' ? 'القيمة' : 'Value',  cell: (r) => r.v, flex: 1, align: 'right' },
            ]}
          />

          <SubHeading locale={locale}>
            {locale === 'ar' ? 'القائمة' : 'Detail'}
          </SubHeading>
          <DataTable
            locale={locale}
            rows={data.observations}
            columns={[
              { header: locale === 'ar' ? 'المرجع' : 'Ref', cell: (r) => r.reference ?? '—', flex: 1 },
              { header: locale === 'ar' ? 'العنوان' : 'Title', cell: (r) => r.title, flex: 3 },
              {
                header: locale === 'ar' ? 'الخطورة' : 'Severity',
                cell: (r) => <SeverityBadge severity={r.severity} />,
                flex: 1,
              },
              { header: locale === 'ar' ? 'المصدر' : 'Source', cell: (r) => r.source ?? '—', flex: 1 },
              {
                header: locale === 'ar' ? 'الحالة' : 'Status',
                cell: (r) => <StatusBadge status={r.status} />,
                flex: 1,
              },
              { header: locale === 'ar' ? 'المُعيَّن' : 'Assignee', cell: (r) => r.assignee ?? '—', flex: 1 },
              { header: locale === 'ar' ? 'الاستحقاق' : 'Due', cell: (r) => r.dueDate ?? '—', flex: 1 },
            ]}
          />
        </ReportPage>
      </Document>
    )
  },
}
