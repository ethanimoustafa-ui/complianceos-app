// Template: Audit report — audit metadata, findings summary, finding
// detail blocks, and activity log table.

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
  DataTable,
  SeverityBadge,
  StatusBadge,
  styles,
  COLORS,
} from '../base'
import type { PdfTemplate } from '../types'

const FindingSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  severity: z.string(),
  category: z.string().optional(),
  owner: z.string().optional(),
  status: z.string(),
  description: z.string().optional(),
  remediation: z.string().optional(),
})

const ActivitySchema = z.object({
  timestamp: z.string(),
  user: z.string().optional(),
  action: z.string(),
  description: z.string().optional(),
  status: z.string().optional(),
})

const AuditReportDataSchema = z.object({
  organization: z.string(),
  generatedBy: z.string(),
  date: z.string(),

  auditName: z.string(),
  framework: z.string().optional(),
  scope: z.string().optional(),
  leadAuditor: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.string().default('open'),

  findings: z.array(FindingSchema).default([]),
  activityLogs: z.array(ActivitySchema).default([]),
})

export type AuditReportData = z.infer<typeof AuditReportDataSchema>

function counts(findings: AuditReportData['findings']) {
  const c = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const f of findings) {
    const k = f.severity.toLowerCase() as keyof typeof c
    if (k in c) c[k]++
  }
  return c
}

export const auditReportTemplate: PdfTemplate<AuditReportData> = {
  key: 'audit-report',
  schema: AuditReportDataSchema,
  Component: ({ data, locale }) => {
    const c = counts(data.findings)
    return (
      <Document title={`Audit Report — ${data.auditName}`}>
        <CoverPage
          title={locale === 'ar' ? 'تقرير المراجعة' : 'Audit Report'}
          subtitle={data.auditName}
          organization={data.organization}
          generatedBy={data.generatedBy}
          date={data.date}
          locale={locale}
        />

        <ReportPage
          locale={locale}
          title={locale === 'ar' ? 'تقرير المراجعة' : 'Audit Report'}
          organization={data.organization}
        >
          <SubHeading locale={locale}>
            {locale === 'ar' ? 'معلومات المراجعة' : 'Audit Information'}
          </SubHeading>
          <DataTable
            locale={locale}
            rows={[
              { k: locale === 'ar' ? 'الاسم' : 'Audit name', v: data.auditName },
              { k: locale === 'ar' ? 'الإطار' : 'Framework', v: data.framework ?? '—' },
              { k: locale === 'ar' ? 'النطاق' : 'Scope', v: data.scope ?? '—' },
              { k: locale === 'ar' ? 'المراجع الرئيسي' : 'Lead Auditor', v: data.leadAuditor ?? '—' },
              { k: locale === 'ar' ? 'تاريخ البدء' : 'Start date', v: data.startDate ?? '—' },
              { k: locale === 'ar' ? 'تاريخ الانتهاء' : 'End date',   v: data.endDate ?? '—' },
            ]}
            columns={[
              { header: locale === 'ar' ? 'الحقل' : 'Field', cell: (r) => r.k, flex: 1 },
              { header: locale === 'ar' ? 'القيمة' : 'Value', cell: (r) => r.v, flex: 2 },
            ]}
          />
          <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.body, { marginRight: 8 }]}>
              {locale === 'ar' ? 'الحالة:' : 'Status:'}
            </Text>
            <StatusBadge status={data.status} />
          </View>

          <SubHeading locale={locale}>
            {locale === 'ar' ? 'ملخص النتائج' : 'Findings Summary'}
          </SubHeading>
          <DataTable
            locale={locale}
            rows={[
              {
                critical: c.critical,
                high:     c.high,
                medium:   c.medium,
                low:      c.low,
              },
            ]}
            columns={[
              { header: locale === 'ar' ? 'حرجة' : 'Critical', cell: (r) => r.critical, flex: 1, align: 'center' },
              { header: locale === 'ar' ? 'عالية' : 'High',    cell: (r) => r.high,     flex: 1, align: 'center' },
              { header: locale === 'ar' ? 'متوسطة' : 'Medium', cell: (r) => r.medium,   flex: 1, align: 'center' },
              { header: locale === 'ar' ? 'منخفضة' : 'Low',    cell: (r) => r.low,      flex: 1, align: 'center' },
            ]}
          />

          <SubHeading locale={locale}>
            {locale === 'ar' ? 'تفاصيل النتائج' : 'Detailed Findings'}
          </SubHeading>
          {data.findings.length === 0 ? (
            <Body locale={locale}>
              {locale === 'ar' ? 'لا توجد نتائج مسجلة.' : 'No findings recorded.'}
            </Body>
          ) : (
            data.findings.map((f, i) => (
              <View key={i} style={{ marginBottom: 10 }} wrap={false}>
                <SubSubHeading locale={locale}>
                  {i + 1}. {f.name}
                </SubSubHeading>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                  <SeverityBadge severity={f.severity} />
                  <StatusBadge status={f.status} />
                </View>
                {f.category ? (
                  <Body locale={locale} style={{ color: COLORS.slate500 }}>
                    {locale === 'ar' ? 'التصنيف' : 'Category'}: {f.category}
                  </Body>
                ) : null}
                {f.owner ? (
                  <Body locale={locale} style={{ color: COLORS.slate500 }}>
                    {locale === 'ar' ? 'المسؤول' : 'Owner'}: {f.owner}
                  </Body>
                ) : null}
                {f.description ? <Body locale={locale}>{f.description}</Body> : null}
                {f.remediation ? (
                  <Body locale={locale} style={{ marginTop: 2 }}>
                    <Text style={{ fontWeight: 700 }}>
                      {locale === 'ar' ? 'العلاج: ' : 'Remediation: '}
                    </Text>
                    {f.remediation}
                  </Body>
                ) : null}
              </View>
            ))
          )}

          <SubHeading locale={locale}>
            {locale === 'ar' ? 'سجل النشاط' : 'Activity Log'}
          </SubHeading>
          <DataTable
            locale={locale}
            rows={data.activityLogs}
            columns={[
              { header: locale === 'ar' ? 'الوقت' : 'Timestamp', cell: (r) => r.timestamp, flex: 2 },
              { header: locale === 'ar' ? 'المستخدم' : 'User',   cell: (r) => r.user ?? '—', flex: 1 },
              { header: locale === 'ar' ? 'الإجراء' : 'Action',  cell: (r) => r.action, flex: 1 },
              { header: locale === 'ar' ? 'الوصف' : 'Description', cell: (r) => r.description ?? '—', flex: 3 },
            ]}
          />
        </ReportPage>
      </Document>
    )
  },
}
