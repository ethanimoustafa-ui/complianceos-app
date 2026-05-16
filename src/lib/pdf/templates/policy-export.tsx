// Template: Policy document export — versions, workflow steps, full text.

import React from 'react'
import { z } from 'zod'
import { View, Text } from '@react-pdf/renderer'
import {
  Document,
  ReportPage,
  CoverPage,
  SubHeading,
  SubSubHeading,
  Body,
  Caption,
  DataTable,
  StatusBadge,
  COLORS,
} from '../base'
import type { PdfTemplate } from '../types'

const VersionSchema = z.object({
  version: z.string(),
  changedBy: z.string().optional(),
  changedAt: z.string().optional(),
  note: z.string().optional(),
})

const WorkflowStepSchema = z.object({
  step: z.number().int().optional(),
  name: z.string(),
  owner: z.string().optional(),
  status: z.string().optional(),
  completedAt: z.string().optional(),
})

const PolicyExportDataSchema = z.object({
  organization: z.string(),
  generatedBy: z.string(),
  date: z.string(),

  title: z.string(),
  category: z.string().optional(),
  owner: z.string().optional(),
  version: z.string().optional(),
  status: z.string().default('draft'),
  effectiveDate: z.string().optional(),
  reviewDate: z.string().optional(),
  summary: z.string().optional(),
  body: z.string().optional(),
  versions: z.array(VersionSchema).default([]),
  workflowSteps: z.array(WorkflowStepSchema).default([]),
})

export type PolicyExportData = z.infer<typeof PolicyExportDataSchema>

export const policyExportTemplate: PdfTemplate<PolicyExportData> = {
  key: 'policy-export',
  schema: PolicyExportDataSchema,
  Component: ({ data, locale }) => (
    <Document title={`Policy — ${data.title}`}>
      <CoverPage
        title={data.title}
        subtitle={data.category}
        organization={data.organization}
        generatedBy={data.generatedBy}
        date={data.date}
        locale={locale}
      />
      <ReportPage
        locale={locale}
        title={data.title}
        organization={data.organization}
      >
        <SubHeading locale={locale}>
          {locale === 'ar' ? 'بيانات السياسة' : 'Policy Metadata'}
        </SubHeading>
        <DataTable
          locale={locale}
          rows={[
            { k: locale === 'ar' ? 'العنوان' : 'Title', v: data.title },
            { k: locale === 'ar' ? 'التصنيف' : 'Category', v: data.category ?? '—' },
            { k: locale === 'ar' ? 'المالك' : 'Owner', v: data.owner ?? '—' },
            { k: locale === 'ar' ? 'الإصدار' : 'Version', v: data.version ?? '—' },
            { k: locale === 'ar' ? 'تاريخ السريان' : 'Effective', v: data.effectiveDate ?? '—' },
            { k: locale === 'ar' ? 'تاريخ المراجعة' : 'Review', v: data.reviewDate ?? '—' },
          ]}
          columns={[
            { header: locale === 'ar' ? 'الحقل' : 'Field', cell: (r) => r.k, flex: 1 },
            { header: locale === 'ar' ? 'القيمة' : 'Value', cell: (r) => r.v, flex: 2 },
          ]}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <Text style={{ marginRight: 8 }}>{locale === 'ar' ? 'الحالة:' : 'Status:'}</Text>
          <StatusBadge status={data.status} />
        </View>

        {data.summary ? (
          <>
            <SubHeading locale={locale}>
              {locale === 'ar' ? 'الملخص' : 'Summary'}
            </SubHeading>
            <Body locale={locale}>{data.summary}</Body>
          </>
        ) : null}

        {data.body ? (
          <>
            <SubHeading locale={locale}>
              {locale === 'ar' ? 'النص' : 'Body'}
            </SubHeading>
            {data.body.split(/\n{2,}/).map((p, i) => (
              <Body locale={locale} key={i} style={{ marginBottom: 6 }}>
                {p}
              </Body>
            ))}
          </>
        ) : null}

        <SubHeading locale={locale}>
          {locale === 'ar' ? 'خطوات سير العمل' : 'Workflow Steps'}
        </SubHeading>
        <DataTable
          locale={locale}
          rows={data.workflowSteps}
          columns={[
            { header: '#', cell: (r, i) => r.step ?? i + 1, flex: 1, align: 'center' },
            { header: locale === 'ar' ? 'الاسم' : 'Name', cell: (r) => r.name, flex: 3 },
            { header: locale === 'ar' ? 'المسؤول' : 'Owner', cell: (r) => r.owner ?? '—', flex: 2 },
            {
              header: locale === 'ar' ? 'الحالة' : 'Status',
              cell: (r) => (r.status ? <StatusBadge status={r.status} /> : '—'),
              flex: 1,
            },
            { header: locale === 'ar' ? 'الإكمال' : 'Completed', cell: (r) => r.completedAt ?? '—', flex: 1 },
          ]}
        />

        <SubHeading locale={locale}>
          {locale === 'ar' ? 'الإصدارات' : 'Versions'}
        </SubHeading>
        <DataTable
          locale={locale}
          rows={data.versions}
          columns={[
            { header: locale === 'ar' ? 'الإصدار' : 'Version', cell: (r) => r.version, flex: 1 },
            { header: locale === 'ar' ? 'بواسطة' : 'By', cell: (r) => r.changedBy ?? '—', flex: 1 },
            { header: locale === 'ar' ? 'التاريخ' : 'Date', cell: (r) => r.changedAt ?? '—', flex: 1 },
            { header: locale === 'ar' ? 'الملاحظة' : 'Note', cell: (r) => r.note ?? '—', flex: 3 },
          ]}
        />
        <Caption locale={locale} style={{ marginTop: 12, color: COLORS.slate500 }}>
          {locale === 'ar' ? 'تم الإنشاء بواسطة ComplianceOS.' : 'Generated by ComplianceOS.'}
        </Caption>

        {/* SubSubHeading is rarely used but exported in base.tsx — keep
            it in the import list so TS doesn't flag dead imports. */}
        {false ? <SubSubHeading locale={locale}>_</SubSubHeading> : null}
      </ReportPage>
    </Document>
  ),
}
