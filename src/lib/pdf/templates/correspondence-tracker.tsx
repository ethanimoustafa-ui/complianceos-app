// Template: Correspondence tracker — generic regulator-correspondence
// export. Accepts arbitrary string/number columns and rows from the
// caller — used for the /correspondence list export.

import React from 'react'
import { z } from 'zod'
import {
  Document,
  ReportPage,
  CoverPage,
  SubHeading,
  Caption,
  DataTable,
} from '../base'
import type { PdfTemplate } from '../types'

type RowValue = string | number | null
const RowSchema: z.ZodType<Record<string, RowValue>> = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.null()]),
)
const CorrespondenceTrackerSchema = z.object({
  organization: z.string(),
  generatedBy: z.string(),
  date: z.string(),
  title: z.string().default('Correspondence'),
  subtitle: z.string().optional(),
  /** Column headers in display order. */
  columns: z.array(z.object({ key: z.string(), label: z.string() })).default([]),
  rows: z.array(RowSchema).default([]),
})

export type CorrespondenceTrackerData = z.infer<typeof CorrespondenceTrackerSchema>

export const correspondenceTrackerTemplate: PdfTemplate<CorrespondenceTrackerData> = {
  key: 'correspondence-tracker',
  schema: CorrespondenceTrackerSchema,
  Component: ({ data, locale }) => (
    <Document title={data.title}>
      <CoverPage
        title={data.title}
        subtitle={data.subtitle}
        organization={data.organization}
        generatedBy={data.generatedBy}
        date={data.date}
        locale={locale}
      />
      <ReportPage
        locale={locale}
        title={data.title}
        organization={data.organization}
        orientation={data.columns.length > 6 ? 'landscape' : 'portrait'}
      >
        <SubHeading locale={locale}>{data.title}</SubHeading>
        {data.subtitle ? <Caption locale={locale}>{data.subtitle}</Caption> : null}
        <DataTable
          locale={locale}
          rows={data.rows}
          columns={data.columns.map((c) => ({
            header: c.label,
            cell: (r: Record<string, RowValue>) => {
              const v = r[c.key]
              if (v === null || v === undefined) return '—'
              return String(v)
            },
          }))}
        />
      </ReportPage>
    </Document>
  ),
}
