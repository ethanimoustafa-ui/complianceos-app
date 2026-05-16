// Shared layout primitives for all PDF templates.
//
// Why this layer exists:
//   - One place to set page geometry, margins, fonts, header/footer.
//   - One place to flip RTL/LTR per `locale`.
//   - One place to encode the ComplianceOS visual identity (brand colors,
//     severity badges, status pills, table look) so templates stay terse.
//
// Templates compose these primitives — they should *not* re-import
// react-pdf primitives directly except in rare cases (charts, SVG).

import React, { ReactNode } from 'react'
import {
  Page,
  View,
  Text,
  StyleSheet,
  Document,
} from '@react-pdf/renderer'
import type { Style } from '@react-pdf/stylesheet'

export type Locale = 'en' | 'ar'

// ── ComplianceOS palette (mirrors tailwind.config + base.tex) ───────────
export const COLORS = {
  emerald:       '#10B981',
  emeraldDark:   '#059669',
  emeraldLight:  '#D1FAE5',
  slate900:      '#0F172A',
  slate700:      '#334155',
  slate500:      '#64748B',
  slate300:      '#CBD5E1',
  slate200:      '#E2E8F0',
  slate100:      '#F1F5F9',
  slate50:       '#F8FAFC',
  rose:          '#F43F5E',
  roseLight:     '#FFE4E6',
  amber:         '#F59E0B',
  amberLight:    '#FEF3C7',
  blue:          '#3B82F6',
  blueLight:     '#DBEAFE',
  white:         '#FFFFFF',
} as const

// Font family per locale. The registry loads both — picking by locale here
// keeps every <Text> default-styled.
export function fontFamilyFor(locale: Locale): string {
  return locale === 'ar' ? 'Amiri' : 'Inter'
}

// ── StyleSheet ───────────────────────────────────────────────────────────
// Single sheet shared across templates; per-template tweaks done via `style`
// prop overrides at call sites.
export const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10,
    color: COLORS.slate900,
    fontFamily: 'Inter',
    backgroundColor: COLORS.white,
  },
  pageAr: {
    fontFamily: 'Amiri',
  },
  header: {
    position: 'absolute',
    top: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.slate200,
    paddingBottom: 6,
  },
  headerText: {
    fontSize: 8,
    color: COLORS.slate500,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: COLORS.slate200,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 8,
    color: COLORS.slate500,
  },
  brandBar: {
    height: 3,
    backgroundColor: COLORS.emerald,
    marginBottom: 18,
  },
  h1: { fontSize: 22, fontWeight: 700, color: COLORS.slate900, marginBottom: 6 },
  h2: { fontSize: 16, fontWeight: 700, color: COLORS.slate900, marginTop: 16, marginBottom: 8 },
  h3: { fontSize: 12, fontWeight: 700, color: COLORS.slate700, marginTop: 10, marginBottom: 4 },
  body: { fontSize: 10, color: COLORS.slate900, lineHeight: 1.5 },
  caption: { fontSize: 8, color: COLORS.slate500 },
  muted: { color: COLORS.slate500 },
  rtl: { textAlign: 'right' },
  ltr: { textAlign: 'left' },
  divider: { height: 0.5, backgroundColor: COLORS.slate200, marginVertical: 10 },
  // Tables
  table: { width: '100%', marginTop: 6 },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: COLORS.slate50, borderBottomWidth: 1, borderBottomColor: COLORS.slate200 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: COLORS.slate100 },
  tableCellHeader: { fontSize: 9, fontWeight: 700, color: COLORS.slate700, paddingVertical: 6, paddingHorizontal: 6 },
  tableCell: { fontSize: 9, color: COLORS.slate900, paddingVertical: 6, paddingHorizontal: 6 },
  // Badges
  badge: { fontSize: 8, fontWeight: 700, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3 },
  // Cover page
  coverWrap: {
    flex: 1,
    paddingTop: 100,
    paddingBottom: 80,
    paddingHorizontal: 48,
    backgroundColor: COLORS.white,
  },
  coverBrandBar: {
    height: 6,
    width: '100%',
    backgroundColor: COLORS.emerald,
    marginBottom: 40,
  },
  coverTitle: {
    fontSize: 32,
    fontWeight: 700,
    color: COLORS.slate900,
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 14,
    color: COLORS.slate500,
    marginBottom: 48,
  },
  coverMetaLabel: {
    fontSize: 9,
    color: COLORS.slate500,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  coverMetaValue: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.slate900,
    marginBottom: 14,
  },
  coverFooter: {
    position: 'absolute',
    left: 48,
    right: 48,
    bottom: 80,
    fontSize: 8,
    color: COLORS.slate500,
  },
})

// ── Text helpers ─────────────────────────────────────────────────────────
interface TextLikeProps {
  children: ReactNode
  locale?: Locale
  style?: Style | Style[]
}

function mergeStyles(...parts: Array<Style | Style[] | undefined>): Style[] {
  const out: Style[] = []
  for (const p of parts) {
    if (!p) continue
    if (Array.isArray(p)) out.push(...p)
    else out.push(p)
  }
  return out
}

export function Heading({ children, locale = 'en', style }: TextLikeProps) {
  return (
    <Text style={mergeStyles(styles.h1, locale === 'ar' ? styles.rtl : styles.ltr, style)}>
      {children}
    </Text>
  )
}

export function SubHeading({ children, locale = 'en', style }: TextLikeProps) {
  return (
    <Text style={mergeStyles(styles.h2, locale === 'ar' ? styles.rtl : styles.ltr, style)}>
      {children}
    </Text>
  )
}

export function SubSubHeading({ children, locale = 'en', style }: TextLikeProps) {
  return (
    <Text style={mergeStyles(styles.h3, locale === 'ar' ? styles.rtl : styles.ltr, style)}>
      {children}
    </Text>
  )
}

export function Body({ children, locale = 'en', style }: TextLikeProps) {
  return (
    <Text style={mergeStyles(styles.body, locale === 'ar' ? styles.rtl : styles.ltr, style)}>
      {children}
    </Text>
  )
}

export function Caption({ children, locale = 'en', style }: TextLikeProps) {
  return (
    <Text style={mergeStyles(styles.caption, locale === 'ar' ? styles.rtl : styles.ltr, style)}>
      {children}
    </Text>
  )
}

// ── Page wrapper with header / footer / page numbers ────────────────────
interface ReportPageProps {
  children: ReactNode
  locale?: Locale
  title?: string
  organization?: string
  orientation?: 'portrait' | 'landscape'
}

export function ReportPage({
  children,
  locale = 'en',
  title,
  organization,
  orientation = 'portrait',
}: ReportPageProps) {
  const pageStyles: Style[] = [styles.page]
  if (locale === 'ar') pageStyles.push(styles.pageAr)
  return (
    <Page size="A4" orientation={orientation} style={pageStyles}>
      <View style={styles.header} fixed>
        <Text style={styles.headerText}>{title ?? ''}</Text>
        <Text style={styles.headerText}>ComplianceOS</Text>
      </View>
      <View style={styles.brandBar} fixed />
      {children}
      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>{organization ?? 'CONFIDENTIAL'}</Text>
        <Text
          style={styles.footerText}
          render={({ pageNumber, totalPages }) =>
            locale === 'ar'
              ? `${pageNumber} / ${totalPages}`
              : `Page ${pageNumber} of ${totalPages}`
          }
        />
      </View>
    </Page>
  )
}

// ── Cover page ───────────────────────────────────────────────────────────
export interface CoverProps {
  title: string
  subtitle?: string
  organization: string
  generatedBy: string
  date: string
  locale?: Locale
  classification?: string
}

export function CoverPage({
  title,
  subtitle,
  organization,
  generatedBy,
  date,
  locale = 'en',
  classification = 'CONFIDENTIAL',
}: CoverProps) {
  const align = locale === 'ar' ? styles.rtl : styles.ltr
  const L = (en: string, ar: string) => (locale === 'ar' ? ar : en)
  return (
    <Page size="A4" style={[styles.page, locale === 'ar' ? styles.pageAr : {}]}>
      <View style={styles.coverWrap}>
        <View style={styles.coverBrandBar} />
        <Text style={[styles.coverTitle, align]}>{title}</Text>
        {subtitle ? <Text style={[styles.coverSubtitle, align]}>{subtitle}</Text> : null}

        <View>
          <Text style={[styles.coverMetaLabel, align]}>
            {L('Organization', 'المؤسسة')}
          </Text>
          <Text style={[styles.coverMetaValue, align]}>{organization}</Text>

          <Text style={[styles.coverMetaLabel, align]}>
            {L('Prepared by', 'أعدّ بواسطة')}
          </Text>
          <Text style={[styles.coverMetaValue, align]}>{generatedBy}</Text>

          <Text style={[styles.coverMetaLabel, align]}>{L('Date', 'التاريخ')}</Text>
          <Text style={[styles.coverMetaValue, align]}>{date}</Text>

          <Text style={[styles.coverMetaLabel, align]}>
            {L('Classification', 'التصنيف')}
          </Text>
          <Text style={[styles.coverMetaValue, align]}>{classification}</Text>
        </View>

        <Text style={[styles.coverFooter, align]}>
          {L(
            'Generated by ComplianceOS — This document is auto-generated and subject to the organization\'s document control policies.',
            'تم إنشاء هذا المستند بواسطة ComplianceOS — يخضع لسياسات التحكم بالمستندات لدى المنشأة.',
          )}
        </Text>
      </View>
    </Page>
  )
}

// ── Severity / status badges ─────────────────────────────────────────────
const SEVERITY_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  critical: { bg: COLORS.roseLight,    fg: COLORS.rose,        label: 'CRITICAL' },
  high:     { bg: COLORS.roseLight,    fg: COLORS.rose,        label: 'HIGH' },
  medium:   { bg: COLORS.amberLight,   fg: COLORS.amber,       label: 'MEDIUM' },
  low:      { bg: COLORS.emeraldLight, fg: COLORS.emeraldDark, label: 'LOW' },
  info:     { bg: COLORS.blueLight,    fg: COLORS.blue,        label: 'INFO' },
}

export function SeverityBadge({ severity }: { severity: string }) {
  const key = severity?.toLowerCase?.() ?? ''
  const def = SEVERITY_STYLES[key] ?? {
    bg: COLORS.slate100,
    fg: COLORS.slate700,
    label: severity?.toUpperCase?.() ?? '—',
  }
  return (
    <Text style={[styles.badge, { backgroundColor: def.bg, color: def.fg }]}>{def.label}</Text>
  )
}

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  open:        { bg: COLORS.blueLight,    fg: COLORS.blue,        label: 'OPEN' },
  in_progress: { bg: COLORS.amberLight,   fg: COLORS.amber,       label: 'IN PROGRESS' },
  in_review:   { bg: COLORS.amberLight,   fg: COLORS.amber,       label: 'IN REVIEW' },
  closed:      { bg: COLORS.emeraldLight, fg: COLORS.emeraldDark, label: 'CLOSED' },
  completed:   { bg: COLORS.emeraldLight, fg: COLORS.emeraldDark, label: 'COMPLETED' },
  approved:    { bg: COLORS.emeraldLight, fg: COLORS.emeraldDark, label: 'APPROVED' },
  overdue:     { bg: COLORS.roseLight,    fg: COLORS.rose,        label: 'OVERDUE' },
  draft:       { bg: COLORS.slate100,     fg: COLORS.slate700,    label: 'DRAFT' },
  sent:        { bg: COLORS.blueLight,    fg: COLORS.blue,        label: 'SENT' },
}

export function StatusBadge({ status }: { status: string }) {
  const key = status?.toLowerCase?.()?.replace(/[\s-]/g, '_') ?? ''
  const def = STATUS_STYLES[key] ?? {
    bg: COLORS.slate100,
    fg: COLORS.slate700,
    label: status?.toUpperCase?.() ?? '—',
  }
  return (
    <Text style={[styles.badge, { backgroundColor: def.bg, color: def.fg }]}>{def.label}</Text>
  )
}

// ── DataTable ───────────────────────────────────────────────────────────
export interface DataColumn<Row> {
  /** Header label. */
  header: string
  /** Row-cell renderer (string, number, or React node). */
  cell: (row: Row, index: number) => ReactNode
  /** Flex weight; columns share the row width by these. Default 1. */
  flex?: number
  /** Optional align override. Default 'left' (or 'right' when locale=ar). */
  align?: 'left' | 'right' | 'center'
}

export interface DataTableProps<Row> {
  rows: Row[]
  columns: DataColumn<Row>[]
  locale?: Locale
  /** Render a placeholder when rows is empty. Default 'No records'. */
  emptyText?: string
}

export function DataTable<Row>({
  rows,
  columns,
  locale = 'en',
  emptyText,
}: DataTableProps<Row>) {
  const defaultAlign = locale === 'ar' ? 'right' : 'left'
  const totalFlex = columns.reduce((s, c) => s + (c.flex ?? 1), 0)
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        {columns.map((c, i) => (
          <View key={i} style={{ flexBasis: `${((c.flex ?? 1) / totalFlex) * 100}%` }}>
            <Text
              style={[
                styles.tableCellHeader,
                { textAlign: c.align ?? defaultAlign },
              ]}
            >
              {c.header}
            </Text>
          </View>
        ))}
      </View>

      {rows.length === 0 ? (
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, { textAlign: 'center', flex: 1 }, styles.muted]}>
            {emptyText ?? (locale === 'ar' ? 'لا توجد سجلات' : 'No records')}
          </Text>
        </View>
      ) : (
        rows.map((row, rIdx) => (
          <View key={rIdx} style={styles.tableRow} wrap={false}>
            {columns.map((c, cIdx) => (
              <View
                key={cIdx}
                style={{ flexBasis: `${((c.flex ?? 1) / totalFlex) * 100}%` }}
              >
                <View style={[styles.tableCell, { textAlign: c.align ?? defaultAlign }]}>
                  {renderCell(c.cell(row, rIdx))}
                </View>
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  )
}

function renderCell(value: ReactNode): ReactNode {
  if (value === null || value === undefined) {
    return <Text style={{ color: COLORS.slate500 }}>—</Text>
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return <Text>{String(value)}</Text>
  }
  return value
}

// Re-export Document so templates only need this one file.
export { Document }
