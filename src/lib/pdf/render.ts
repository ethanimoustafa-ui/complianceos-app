// Central PDF render entry-point.
//
// `renderPdf({ template, data, locale, options })` looks up the template
// by key, validates `data` against the template's Zod schema, registers
// fonts once, and returns a Node Buffer of the rendered PDF.
//
// All side effects (Supabase upload, job status update, audit log) happen
// in the cron worker — this module is pure (data in -> PDF buffer out).

import { renderToBuffer } from '@react-pdf/renderer'
import { ensureFontsRegistered } from './registry'
import { ValidationFailed } from '@/lib/api/errors'
import type { Locale } from './base'
import type { PdfTemplate, TemplateKey, TemplateOptions } from './types'

import { samaLetterTemplate }            from './templates/sama-letter'
import { auditReportTemplate }           from './templates/audit-report'
import { complianceReportTemplate }      from './templates/compliance-report'
import { riskRegisterTemplate }          from './templates/risk-register'
import { observationListTemplate }       from './templates/observation-list'
import { policyExportTemplate }          from './templates/policy-export'
import { correspondenceTrackerTemplate } from './templates/correspondence-tracker'
import { trainingReportTemplate }        from './templates/training-report'
import { calendarExportTemplate }        from './templates/calendar-export'

// Keep the registry as a typed map of `key -> template` but loosen the
// generic at the lookup site (we don't know the data shape until the
// schema validates it). Using `PdfTemplate<unknown>` would force every
// template to declare its data as `unknown`; using `any` here is the
// pragmatic choice and is contained to this file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<TemplateKey, PdfTemplate<any>> = {
  'sama-letter':            samaLetterTemplate,
  'audit-report':           auditReportTemplate,
  'compliance-report':      complianceReportTemplate,
  'risk-register':          riskRegisterTemplate,
  'observation-list':       observationListTemplate,
  'policy-export':          policyExportTemplate,
  'correspondence-tracker': correspondenceTrackerTemplate,
  'training-report':        trainingReportTemplate,
  'calendar-export':        calendarExportTemplate,
}

export const TEMPLATE_KEYS: TemplateKey[] = Object.keys(REGISTRY) as TemplateKey[]

export function isTemplateKey(s: string): s is TemplateKey {
  return s in REGISTRY
}

export interface RenderPdfArgs {
  template: TemplateKey
  data: unknown
  locale: Locale
  options?: TemplateOptions
}

export interface RenderPdfResult {
  buffer: Buffer
  filename: string
}

export async function renderPdf(args: RenderPdfArgs): Promise<RenderPdfResult> {
  ensureFontsRegistered()

  const tpl = REGISTRY[args.template]
  if (!tpl) {
    throw ValidationFailed({ template: args.template }, `Unknown template: ${args.template}`)
  }

  const parsed = tpl.schema.safeParse(args.data)
  if (!parsed.success) {
    throw ValidationFailed(parsed.error.flatten(), `Invalid data for template '${args.template}'`)
  }

  const element = tpl.Component({
    data: parsed.data,
    locale: args.locale,
    options: args.options,
  })

  const buffer = await renderToBuffer(element)

  const filename =
    args.options?.filenameHint ??
    (tpl.filename
      ? tpl.filename({ data: parsed.data, locale: args.locale, options: args.options })
      : `${args.template}-${new Date().toISOString().slice(0, 10)}.pdf`)

  return { buffer, filename: ensurePdfExt(sanitizeFilename(filename)) }
}

function sanitizeFilename(name: string): string {
  let out = name.replace(/[\\/:*?"<>|]/g, '_')
  // Strip control chars (0x00-0x1f).
  out = out
    .split('')
    .filter((ch) => ch.charCodeAt(0) >= 0x20)
    .join('')
  out = out.replace(/\s+/g, ' ').trim()
  return out.slice(0, 180)
}

function ensurePdfExt(name: string): string {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`
}
