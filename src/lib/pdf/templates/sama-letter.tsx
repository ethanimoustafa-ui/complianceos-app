// Template: SAMA / regulatory authority correspondence letter.
//
// Used for the "Send to authority" flow on /correspondence/letters. The
// existing client-side flow (html2canvas+jsPDF on letters/page.tsx) is
// being replaced with this server-side render.
//
// Bilingual: when locale='ar', the letterhead, salutation, body, and
// signatures all render right-to-left in Amiri. Per orchestrator decision
// (BACKEND-API-MAP §13.10) SAMA letters MUST ship bilingual at launch.

import React from 'react'
import { z } from 'zod'
import { View, Text, Page } from '@react-pdf/renderer'
import {
  Document,
  COLORS,
  styles,
  fontFamilyFor,
  type Locale,
} from '../base'
import type { PdfTemplate } from '../types'

const ParagraphSchema = z.string()
const AttachmentSchema = z.object({
  name: z.string(),
  size: z.number().optional(),
})

const SamaLetterDataSchema = z.object({
  organizationName: z.string(),
  organizationAddress: z.string().optional(),
  crNumber: z.string().optional(),

  letterReference: z.string(),
  letterDate: z.string(),

  recipientName: z.string(),
  recipientTitle: z.string().optional(),
  recipientOrg: z.string().optional(),

  subject: z.string(),
  salutation: z.string().optional(),
  bodyParagraphs: z.array(ParagraphSchema).default([]),
  /** If provided, replaces `bodyParagraphs` (legacy single-string body). */
  body: z.string().optional(),

  closingLine: z.string().optional(),

  attachments: z.array(AttachmentSchema).default([]),

  signatoryName: z.string(),
  signatoryTitle: z.string().optional(),
})

export type SamaLetterData = z.infer<typeof SamaLetterDataSchema>

function paragraphsFor(data: SamaLetterData): string[] {
  if (data.bodyParagraphs && data.bodyParagraphs.length > 0) {
    return data.bodyParagraphs
  }
  if (data.body) {
    return data.body.split(/\n{2,}/).filter((p) => p.trim().length > 0)
  }
  return []
}

const letterStyles = {
  page: {
    paddingTop: 72,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontSize: 11,
    color: COLORS.slate900,
    lineHeight: 1.6,
  } as const,
  letterheadName: { fontSize: 18, fontWeight: 700, color: COLORS.slate900, marginBottom: 4 } as const,
  letterheadMeta: { fontSize: 9, color: COLORS.slate500 } as const,
  brandRule: { height: 2, backgroundColor: COLORS.emerald, marginVertical: 18 } as const,
  metaRow: { flexDirection: 'row', marginBottom: 4 } as const,
  metaLabel: { width: 90, fontSize: 10, fontWeight: 700, color: COLORS.slate700 } as const,
  metaValue: { fontSize: 10, color: COLORS.slate900, flex: 1 } as const,
  subject: { fontSize: 11, fontWeight: 700, marginTop: 18, marginBottom: 18 } as const,
  para: { fontSize: 11, color: COLORS.slate900, marginBottom: 10, lineHeight: 1.6 } as const,
  signatoryName: { fontSize: 11, fontWeight: 700, marginTop: 56 } as const,
  signatoryTitle: { fontSize: 10, color: COLORS.slate500 } as const,
  attHeader: { fontSize: 10, fontWeight: 700, marginTop: 16, marginBottom: 4 } as const,
  attItem: { fontSize: 10, marginBottom: 2 } as const,
}

function SamaLetterDocument({
  data,
  locale,
}: {
  data: SamaLetterData
  locale: Locale
}) {
  const isRtl = locale === 'ar'
  const align = isRtl ? 'right' : 'left'
  const L = (en: string, ar: string) => (isRtl ? ar : en)

  const paragraphs = paragraphsFor(data)
  const salutation =
    data.salutation ??
    L(`Dear ${data.recipientTitle ?? ''} ${data.recipientName}`.trim() + ',', `السادة / ${data.recipientName} المحترمين،`)
  const closing = data.closingLine ?? L('Respectfully,', 'وتفضلوا بقبول فائق الاحترام،')

  return (
    <Page
      size="A4"
      style={{
        ...letterStyles.page,
        fontFamily: fontFamilyFor(locale),
        textAlign: align,
      }}
    >
      {/* Letterhead */}
      <View style={{ alignItems: 'center' }}>
        <Text style={letterStyles.letterheadName}>{data.organizationName}</Text>
        {data.organizationAddress ? (
          <Text style={letterStyles.letterheadMeta}>{data.organizationAddress}</Text>
        ) : null}
        {data.crNumber ? (
          <Text style={letterStyles.letterheadMeta}>
            {L('CR No.', 'سجل تجاري')}: {data.crNumber}
          </Text>
        ) : null}
      </View>

      <View style={letterStyles.brandRule} />

      {/* Reference / date / to */}
      <View style={{ flexDirection: 'column' }}>
        <View style={letterStyles.metaRow}>
          <Text style={letterStyles.metaLabel}>{L('Reference', 'المرجع')}:</Text>
          <Text style={letterStyles.metaValue}>{data.letterReference}</Text>
        </View>
        <View style={letterStyles.metaRow}>
          <Text style={letterStyles.metaLabel}>{L('Date', 'التاريخ')}:</Text>
          <Text style={letterStyles.metaValue}>{data.letterDate}</Text>
        </View>
        <View style={letterStyles.metaRow}>
          <Text style={letterStyles.metaLabel}>{L('To', 'إلى')}:</Text>
          <View style={{ flex: 1 }}>
            <Text style={letterStyles.metaValue}>{data.recipientName}</Text>
            {data.recipientTitle ? (
              <Text style={letterStyles.metaValue}>{data.recipientTitle}</Text>
            ) : null}
            <Text style={letterStyles.metaValue}>
              {data.recipientOrg ?? L('Saudi Central Bank (SAMA)', 'البنك المركزي السعودي')}
            </Text>
          </View>
        </View>
      </View>

      {/* Subject */}
      <Text style={letterStyles.subject}>
        {L('Subject', 'الموضوع')}: {data.subject}
      </Text>

      {/* Salutation + body */}
      <Text style={letterStyles.para}>{salutation}</Text>

      {paragraphs.map((p, i) => (
        <Text key={i} style={letterStyles.para}>
          {p}
        </Text>
      ))}

      {/* Closing + signature */}
      <Text style={[letterStyles.para, { marginTop: 12 }]}>{closing}</Text>
      <Text style={letterStyles.signatoryName}>{data.signatoryName}</Text>
      {data.signatoryTitle ? (
        <Text style={letterStyles.signatoryTitle}>{data.signatoryTitle}</Text>
      ) : null}
      <Text style={letterStyles.signatoryTitle}>{data.organizationName}</Text>

      {/* Attachments */}
      {data.attachments.length > 0 ? (
        <View>
          <Text style={letterStyles.attHeader}>{L('Attachments', 'المرفقات')}:</Text>
          {data.attachments.map((a, i) => (
            <Text key={i} style={letterStyles.attItem}>
              {i + 1}. {a.name}
            </Text>
          ))}
        </View>
      ) : null}

      {/* Footer with page numbers */}
      <View
        style={[styles.footer, { fontFamily: fontFamilyFor(locale) }]}
        fixed
      >
        <Text style={styles.footerText}>{data.organizationName}</Text>
        <Text
          style={styles.footerText}
          render={({ pageNumber, totalPages }) =>
            isRtl
              ? `${pageNumber} / ${totalPages}`
              : `Page ${pageNumber} of ${totalPages}`
          }
        />
      </View>
    </Page>
  )
}

export const samaLetterTemplate: PdfTemplate<SamaLetterData> = {
  key: 'sama-letter',
  schema: SamaLetterDataSchema,
  Component: ({ data, locale }) => (
    <Document title={`SAMA Letter ${data.letterReference}`}>
      <SamaLetterDocument data={data} locale={locale} />
    </Document>
  ),
  filename: ({ data, locale }) => `Letter-${data.letterReference}-${locale}.pdf`,
}
