// Template: Risk register — landscape A4 with 5×5 SVG heat map and table.

import React from 'react'
import { z } from 'zod'
import { View, Svg, Rect, Circle, Text as SvgText } from '@react-pdf/renderer'
import {
  Document,
  ReportPage,
  CoverPage,
  SubHeading,
  Body,
  DataTable,
  StatusBadge,
  COLORS,
} from '../base'
import type { PdfTemplate } from '../types'

const RiskSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  riskScore: z.number().optional(),
  mitigation: z.string().optional(),
  owner: z.string().optional(),
  treatment: z.string().optional(),
  status: z.string().default('open'),
})

const RiskRegisterDataSchema = z.object({
  organization: z.string(),
  generatedBy: z.string(),
  date: z.string(),
  period: z.string().optional(),
  risks: z.array(RiskSchema).default([]),
})

export type RiskRegisterData = z.infer<typeof RiskRegisterDataSchema>

function cellColor(score: number): string {
  if (score > 15) return COLORS.rose
  if (score > 9) return COLORS.amber
  if (score > 4) return COLORS.blue
  return COLORS.emerald
}

function HeatMap({ risks }: { risks: RiskRegisterData['risks'] }) {
  const cell = 36
  const padding = 28
  const w = padding + cell * 5 + 24
  const h = padding + cell * 5 + 24

  return (
    <Svg width={w} height={h}>
      {/* Axis labels */}
      <SvgText x={padding + (cell * 5) / 2} y={h - 6} style={{ fontSize: 8, fontFamily: 'Inter', fill: COLORS.slate700 }}>
        Likelihood →
      </SvgText>
      <SvgText x={6} y={padding + (cell * 5) / 2} style={{ fontSize: 8, fontFamily: 'Inter', fill: COLORS.slate700 }}>
        Impact ↑
      </SvgText>

      {/* Grid cells: x = likelihood 1..5, y = impact 5..1 (top→bottom). */}
      {Array.from({ length: 5 }).map((_, row) =>
        Array.from({ length: 5 }).map((_, col) => {
          const likelihood = col + 1
          const impact = 5 - row
          const score = likelihood * impact
          const x = padding + col * cell
          const y = padding + row * cell
          return (
            <React.Fragment key={`${row}-${col}`}>
              <Rect
                x={x}
                y={y}
                width={cell}
                height={cell}
                fill={cellColor(score)}
                fillOpacity={0.25}
                stroke={COLORS.slate200}
                strokeWidth={0.5}
              />
              <SvgText
                x={x + cell / 2 - 4}
                y={y + cell / 2 + 3}
                style={{ fontSize: 8, fontFamily: 'Inter', fill: COLORS.slate700 }}
              >
                {String(score)}
              </SvgText>
            </React.Fragment>
          )
        }),
      )}

      {/* Plot risks */}
      {risks.map((r, i) => {
        const x = padding + (r.likelihood - 1) * cell + cell / 2
        const y = padding + (5 - r.impact) * cell + cell / 2
        return (
          <React.Fragment key={i}>
            <Circle cx={x} cy={y} r={3.5} fill={COLORS.slate900} />
            <SvgText
              x={x + 5}
              y={y - 5}
              style={{ fontSize: 6, fontFamily: 'Inter', fill: COLORS.slate900 }}
            >
              {r.id}
            </SvgText>
          </React.Fragment>
        )
      })}

      {/* Axis tick numbers */}
      {Array.from({ length: 5 }).map((_, i) => (
        <React.Fragment key={`ticks-${i}`}>
          <SvgText
            x={padding + i * cell + cell / 2 - 3}
            y={padding + cell * 5 + 10}
            style={{ fontSize: 7, fontFamily: 'Inter', fill: COLORS.slate500 }}
          >
            {String(i + 1)}
          </SvgText>
          <SvgText
            x={padding - 12}
            y={padding + i * cell + cell / 2 + 3}
            style={{ fontSize: 7, fontFamily: 'Inter', fill: COLORS.slate500 }}
          >
            {String(5 - i)}
          </SvgText>
        </React.Fragment>
      ))}
    </Svg>
  )
}

function counts(risks: RiskRegisterData['risks']) {
  const c = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const r of risks) {
    const score = r.riskScore ?? r.likelihood * r.impact
    if (score > 15) c.critical++
    else if (score > 9) c.high++
    else if (score > 4) c.medium++
    else c.low++
  }
  return c
}

export const riskRegisterTemplate: PdfTemplate<RiskRegisterData> = {
  key: 'risk-register',
  schema: RiskRegisterDataSchema,
  Component: ({ data, locale }) => {
    const c = counts(data.risks)
    return (
      <Document title="Risk Register">
        <CoverPage
          title={locale === 'ar' ? 'سجل المخاطر' : 'Risk Register'}
          subtitle={data.period}
          organization={data.organization}
          generatedBy={data.generatedBy}
          date={data.date}
          locale={locale}
        />

        <ReportPage
          locale={locale}
          title={locale === 'ar' ? 'سجل المخاطر' : 'Risk Register'}
          organization={data.organization}
          orientation="landscape"
        >
          <SubHeading locale={locale}>
            {locale === 'ar' ? 'ملخص' : 'Summary'}
          </SubHeading>
          <DataTable
            locale={locale}
            rows={[c]}
            columns={[
              { header: locale === 'ar' ? 'حرجة' : 'Critical', cell: (r) => r.critical, align: 'center' },
              { header: locale === 'ar' ? 'عالية' : 'High',    cell: (r) => r.high,     align: 'center' },
              { header: locale === 'ar' ? 'متوسطة' : 'Medium', cell: (r) => r.medium,   align: 'center' },
              { header: locale === 'ar' ? 'منخفضة' : 'Low',    cell: (r) => r.low,      align: 'center' },
            ]}
          />

          <SubHeading locale={locale}>
            {locale === 'ar' ? 'خريطة المخاطر' : 'Heat Map'}
          </SubHeading>
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <HeatMap risks={data.risks} />
          </View>
          <Body locale={locale} style={{ marginTop: 4, color: COLORS.slate500 }}>
            {locale === 'ar'
              ? 'النقاط تمثل المخاطر، والإحداثيات بناءً على الاحتمال × الأثر.'
              : 'Dots are individual risks plotted at (Likelihood, Impact).'}
          </Body>

          <SubHeading locale={locale}>
            {locale === 'ar' ? 'تفاصيل المخاطر' : 'Risk Detail'}
          </SubHeading>
          <DataTable
            locale={locale}
            rows={data.risks}
            columns={[
              { header: 'ID', cell: (r) => r.id, flex: 1 },
              { header: locale === 'ar' ? 'الاسم' : 'Risk', cell: (r) => r.name, flex: 3 },
              { header: locale === 'ar' ? 'التصنيف' : 'Category', cell: (r) => r.category ?? '—', flex: 1 },
              { header: 'L', cell: (r) => r.likelihood, flex: 1, align: 'center' },
              { header: 'I', cell: (r) => r.impact, flex: 1, align: 'center' },
              {
                header: locale === 'ar' ? 'النتيجة' : 'Score',
                cell: (r) => r.riskScore ?? r.likelihood * r.impact,
                flex: 1,
                align: 'center',
              },
              { header: locale === 'ar' ? 'المعالجة' : 'Treatment', cell: (r) => r.treatment ?? '—', flex: 1 },
              { header: locale === 'ar' ? 'المسؤول' : 'Owner', cell: (r) => r.owner ?? '—', flex: 1 },
              {
                header: locale === 'ar' ? 'الحالة' : 'Status',
                cell: (r) => <StatusBadge status={r.status} />,
                flex: 1,
              },
            ]}
          />
        </ReportPage>
      </Document>
    )
  },
}
