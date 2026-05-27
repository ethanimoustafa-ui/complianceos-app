// W29.1: GET /api/letters/[letterId]/print-pdf
// Generates a PDF of a letter using @react-pdf/renderer (already in deps).
// Returns application/pdf inline with filename=<reference>.pdf.
//
// Authority-agnostic: works for any letter regardless of authority (SAMA, CMA,
// Sharia, internal). The PDF surfaces only the fields stored on the letter
// row + optional signer/signature info.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { LETTER_DETAIL_COLUMNS } from '@/lib/api/services/letters'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  renderToBuffer,
} from '@react-pdf/renderer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 56,
    fontFamily: 'Helvetica',
    fontSize: 11,
    lineHeight: 1.5,
    color: '#1f2937',
  },
  headerBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 12,
    marginBottom: 20,
  },
  refCol: { flexDirection: 'column' },
  authority: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#111827' },
  reference: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  dateRow: { fontSize: 10, color: '#6b7280' },
  recipientBlock: { marginBottom: 18 },
  recipientLabel: {
    fontSize: 9,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  recipientLine: { fontSize: 11, color: '#1f2937' },
  subject: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 14,
    color: '#111827',
  },
  body: { fontSize: 11, marginBottom: 24, color: '#1f2937' },
  signerBlock: { marginTop: 28 },
  signerName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111827' },
  signerTitle: { fontSize: 10, color: '#6b7280', marginTop: 1 },
  signature: { width: 140, height: 50, marginBottom: 6, objectFit: 'contain' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 56,
    right: 56,
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
  },
})

interface LetterRow {
  id: string
  reference: string | null
  authority: string | null
  type: string | null
  subject: string | null
  body: string | null
  recipient_name: string | null
  recipient_org: string | null
  recipient_city: string | null
  signer_name: string | null
  signer_title: string | null
  signature_image_url: string | null
  sent_date: string | null
  created_at: string
}

function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return value
  }
}

// Strip simple HTML tags from a body that may have been authored via the
// rich-text editor. Keeps text content + line breaks; drops markup.
function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ letterId: string }> },
) {
  try {
    const { letterId } = await params
    const { supabase } = await requireUser()

    const { data, error } = await supabase
      .from('letters')
      .select(LETTER_DETAIL_COLUMNS)
      .eq('id', letterId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound('Letter not found')

    const letter = data as unknown as LetterRow

    const authority = (letter.authority ?? '').toUpperCase()
    const reference = letter.reference ?? ''
    const subject = letter.subject ?? '(no subject)'
    const bodyText = htmlToPlainText(letter.body)
    const sentDate = formatDate(letter.sent_date ?? letter.created_at)

    const recipientLines: string[] = []
    if (letter.recipient_name) recipientLines.push(letter.recipient_name)
    if (letter.recipient_org) recipientLines.push(letter.recipient_org)
    if (letter.recipient_city) recipientLines.push(letter.recipient_city)

    const doc = (
      <Document>
        <Page size="A4" style={styles.page}>
          <View style={styles.headerBlock}>
            <View style={styles.refCol}>
              <Text style={styles.authority}>{authority || 'Letter'}</Text>
              {reference ? <Text style={styles.reference}>{reference}</Text> : null}
            </View>
            <View>
              <Text style={styles.dateRow}>{sentDate}</Text>
            </View>
          </View>

          {recipientLines.length > 0 ? (
            <View style={styles.recipientBlock}>
              <Text style={styles.recipientLabel}>To</Text>
              {recipientLines.map((line, i) => (
                <Text key={i} style={styles.recipientLine}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          <Text style={styles.subject}>{subject}</Text>
          <Text style={styles.body}>{bodyText || '(letter has no body)'}</Text>

          {letter.signer_name || letter.signature_image_url ? (
            <View style={styles.signerBlock}>
              {letter.signature_image_url ? (
                /* eslint-disable-next-line jsx-a11y/alt-text */
                <Image src={letter.signature_image_url} style={styles.signature} />
              ) : null}
              {letter.signer_name ? (
                <Text style={styles.signerName}>{letter.signer_name}</Text>
              ) : null}
              {letter.signer_title ? (
                <Text style={styles.signerTitle}>{letter.signer_title}</Text>
              ) : null}
            </View>
          ) : null}

          <Text
            style={styles.footer}
            render={({ pageNumber, totalPages }) =>
              `${reference || authority || 'Letter'} — page ${pageNumber} of ${totalPages}`
            }
            fixed
          />
        </Page>
      </Document>
    )

    const pdfBuffer = await renderToBuffer(doc)
    const filename = `${reference || letter.id}.pdf`

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return handle(e)
  }
}
