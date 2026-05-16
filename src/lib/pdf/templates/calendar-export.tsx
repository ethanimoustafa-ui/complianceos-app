// Template: Calendar deadlines export.

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

const EventSchema = z.object({
  date: z.string(),
  title: z.string(),
  type: z.string().optional(),
  regulator: z.string().optional(),
  priority: z.string().optional(),
  owner: z.string().optional(),
  status: z.string().optional(),
})

const CalendarExportDataSchema = z.object({
  organization: z.string(),
  generatedBy: z.string(),
  date: z.string(),
  rangeLabel: z.string().optional(),
  events: z.array(EventSchema).default([]),
})

export type CalendarExportData = z.infer<typeof CalendarExportDataSchema>

export const calendarExportTemplate: PdfTemplate<CalendarExportData> = {
  key: 'calendar-export',
  schema: CalendarExportDataSchema,
  Component: ({ data, locale }) => (
    <Document title="Calendar Export">
      <CoverPage
        title={locale === 'ar' ? 'تقويم المواعيد' : 'Calendar Export'}
        subtitle={data.rangeLabel}
        organization={data.organization}
        generatedBy={data.generatedBy}
        date={data.date}
        locale={locale}
      />
      <ReportPage
        locale={locale}
        title={locale === 'ar' ? 'تقويم المواعيد' : 'Calendar'}
        organization={data.organization}
      >
        <SubHeading locale={locale}>
          {locale === 'ar' ? 'الأحداث' : 'Events'}
        </SubHeading>
        <DataTable
          locale={locale}
          rows={data.events}
          columns={[
            { header: locale === 'ar' ? 'التاريخ' : 'Date', cell: (r) => r.date, flex: 1 },
            { header: locale === 'ar' ? 'العنوان' : 'Title', cell: (r) => r.title, flex: 3 },
            { header: locale === 'ar' ? 'النوع' : 'Type', cell: (r) => r.type ?? '—', flex: 1 },
            { header: locale === 'ar' ? 'الجهة' : 'Regulator', cell: (r) => r.regulator ?? '—', flex: 1 },
            { header: locale === 'ar' ? 'الأولوية' : 'Priority', cell: (r) => r.priority ?? '—', flex: 1 },
            { header: locale === 'ar' ? 'المسؤول' : 'Owner', cell: (r) => r.owner ?? '—', flex: 1 },
            {
              header: locale === 'ar' ? 'الحالة' : 'Status',
              cell: (r) => (r.status ? <StatusBadge status={r.status} /> : '—'),
              flex: 1,
            },
          ]}
        />
      </ReportPage>
    </Document>
  ),
}
