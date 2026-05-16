// Template: Compliance executive dashboard.
// Overall score, per-framework breakdown, deductions list,
// upcoming regulatory deadlines.

import React from 'react'
import { z } from 'zod'
import { View, Svg, Rect, Text, Text as SvgText } from '@react-pdf/renderer'
import {
  Document,
  ReportPage,
  CoverPage,
  SubHeading,
  Body,
  Caption,
  DataTable,
  StatusBadge,
  COLORS,
} from '../base'
import type { PdfTemplate } from '../types'

const FrameworkSchema = z.object({
  name: z.string(),
  score: z.number(),
  controlsMapped: z.number().optional(),
  controlsTotal: z.number().optional(),
  gapCount: z.number().optional(),
})

const DeductionSchema = z.object({
  source: z.string(),
  reason: z.string(),
  points: z.number(),
})

const DeadlineSchema = z.object({
  date: z.string(),
  description: z.string(),
  regulator: z.string().optional(),
  status: z.string().optional(),
})

const ComplianceReportDataSchema = z.object({
  organization: z.string(),
  generatedBy: z.string(),
  date: z.string(),
  period: z.string().optional(),

  overallScore: z.number(),
  frameworks: z.array(FrameworkSchema).default([]),
  deductions: z.array(DeductionSchema).default([]),
  upcomingDeadlines: z.array(DeadlineSchema).default([]),
})

export type ComplianceReportData = z.infer<typeof ComplianceReportDataSchema>

/** Simple horizontal bar showing 0–100 score. */
function ScoreBar({
  score,
  width = 360,
  height = 14,
}: {
  score: number
  width?: number
  height?: number
}) {
  const clamped = Math.max(0, Math.min(100, score))
  const fillW = (clamped / 100) * width
  const color =
    clamped >= 80 ? COLORS.emerald : clamped >= 60 ? COLORS.amber : COLORS.rose
  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} rx={4} fill={COLORS.slate100} />
      <Rect x={0} y={0} width={fillW} height={height} rx={4} fill={color} />
    </Svg>
  )
}

/** Vertical bar chart for per-framework scores. */
function FrameworkBars({ frameworks }: { frameworks: ComplianceReportData['frameworks'] }) {
  if (frameworks.length === 0) return null
  const w = 480
  const h = 140
  const barW = Math.min(48, (w - 40) / frameworks.length - 8)
  const baseY = h - 24
  const maxBarH = baseY - 12

  return (
    <Svg width={w} height={h}>
      {/* y axis baseline */}
      <Rect x={30} y={baseY} width={w - 40} height={0.5} fill={COLORS.slate300} />
      {frameworks.map((f, i) => {
        const score = Math.max(0, Math.min(100, f.score))
        const x = 32 + i * (barW + 16)
        const barH = (score / 100) * maxBarH
        const y = baseY - barH
        const color =
          score >= 80 ? COLORS.emerald : score >= 60 ? COLORS.amber : COLORS.rose
        return (
          <React.Fragment key={i}>
            <Rect x={x} y={y} width={barW} height={barH} rx={2} fill={color} />
            <SvgText
              x={x + barW / 2}
              y={y - 4}
              style={{ fontSize: 8, fontFamily: 'Inter', fill: COLORS.slate700 }}
            >
              {String(score)}
            </SvgText>
            <SvgText
              x={x + barW / 2}
              y={baseY + 12}
              style={{ fontSize: 7, fontFamily: 'Inter', fill: COLORS.slate500 }}
            >
              {f.name.length > 12 ? f.name.slice(0, 12) + '…' : f.name}
            </SvgText>
          </React.Fragment>
        )
      })}
    </Svg>
  )
}

export const complianceReportTemplate: PdfTemplate<ComplianceReportData> = {
  key: 'compliance-report',
  schema: ComplianceReportDataSchema,
  Component: ({ data, locale, options }) => {
    const includeCharts = options?.includeCharts !== false
    return (
      <Document title="Compliance Report">
        <CoverPage
          title={locale === 'ar' ? 'تقرير الامتثال' : 'Compliance Report'}
          subtitle={data.period}
          organization={data.organization}
          generatedBy={data.generatedBy}
          date={data.date}
          locale={locale}
        />

        <ReportPage
          locale={locale}
          title={locale === 'ar' ? 'تقرير الامتثال' : 'Compliance Report'}
          organization={data.organization}
        >
          <SubHeading locale={locale}>
            {locale === 'ar' ? 'النتيجة العامة' : 'Overall Score'}
          </SubHeading>
          <Body locale={locale}>
            <Text style={{ fontSize: 28, fontWeight: 700, color: COLORS.slate900 }}>
              {Math.round(data.overallScore)}
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.slate500 }}> / 100</Text>
          </Body>
          {includeCharts ? <ScoreBar score={data.overallScore} /> : null}

          <SubHeading locale={locale}>
            {locale === 'ar' ? 'حسب الإطار' : 'Per Framework'}
          </SubHeading>
          <DataTable
            locale={locale}
            rows={data.frameworks}
            columns={[
              { header: locale === 'ar' ? 'الإطار' : 'Framework', cell: (r) => r.name, flex: 2 },
              { header: locale === 'ar' ? 'النتيجة' : 'Score', cell: (r) => `${Math.round(r.score)}%`, flex: 1, align: 'right' },
              {
                header: locale === 'ar' ? 'الضوابط' : 'Controls',
                cell: (r) =>
                  r.controlsMapped !== undefined && r.controlsTotal !== undefined
                    ? `${r.controlsMapped} / ${r.controlsTotal}`
                    : '—',
                flex: 1,
                align: 'right',
              },
              {
                header: locale === 'ar' ? 'الفجوات' : 'Gaps',
                cell: (r) => r.gapCount ?? '—',
                flex: 1,
                align: 'right',
              },
            ]}
          />

          {includeCharts ? (
            <View style={{ marginTop: 12 }}>
              <FrameworkBars frameworks={data.frameworks} />
            </View>
          ) : null}

          <SubHeading locale={locale}>
            {locale === 'ar' ? 'أسباب الخصم' : 'Score Deductions'}
          </SubHeading>
          <DataTable
            locale={locale}
            rows={data.deductions}
            columns={[
              { header: locale === 'ar' ? 'المصدر' : 'Source', cell: (r) => r.source, flex: 1 },
              { header: locale === 'ar' ? 'السبب' : 'Reason', cell: (r) => r.reason, flex: 3 },
              { header: locale === 'ar' ? 'النقاط' : 'Points', cell: (r) => `-${r.points}`, flex: 1, align: 'right' },
            ]}
          />

          <SubHeading locale={locale}>
            {locale === 'ar' ? 'المواعيد القادمة' : 'Upcoming Deadlines'}
          </SubHeading>
          <DataTable
            locale={locale}
            rows={data.upcomingDeadlines}
            columns={[
              { header: locale === 'ar' ? 'التاريخ' : 'Date', cell: (r) => r.date, flex: 1 },
              { header: locale === 'ar' ? 'البند' : 'Item', cell: (r) => r.description, flex: 3 },
              { header: locale === 'ar' ? 'الجهة' : 'Regulator', cell: (r) => r.regulator ?? '—', flex: 1 },
              {
                header: locale === 'ar' ? 'الحالة' : 'Status',
                cell: (r) => (r.status ? <StatusBadge status={r.status} /> : '—'),
                flex: 1,
              },
            ]}
          />
          <Caption locale={locale} style={{ marginTop: 12 }}>
            {locale === 'ar'
              ? 'مصدر هذا التقرير: محرك تقييم الامتثال في ComplianceOS.'
              : 'Source: ComplianceOS scoring engine.'}
          </Caption>
        </ReportPage>
      </Document>
    )
  },
}

