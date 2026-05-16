// PDF template contract — every template implements this and registers
// itself with the central registry in `render.ts`.

import type { z } from 'zod'
import type { ReactElement, ComponentProps } from 'react'
import type { Document } from '@react-pdf/renderer'
import type { Locale } from './base'

/** ReactElement<DocumentProps> — extracted from the Document class type. */
export type DocumentElement = ReactElement<ComponentProps<typeof Document>>

export type TemplateKey =
  | 'sama-letter'
  | 'audit-report'
  | 'compliance-report'
  | 'risk-register'
  | 'observation-list'
  | 'policy-export'
  | 'correspondence-tracker'
  | 'training-report'
  | 'calendar-export'

/** Shared options every template accepts (templates may ignore). */
export interface TemplateOptions {
  orientation?: 'portrait' | 'landscape'
  includeCharts?: boolean
  includeSummary?: boolean
  watermark?: string
  /** Filename hint — used by the API layer when stamping Content-Disposition. */
  filenameHint?: string
}

export interface RenderContext<Data> {
  data: Data
  locale: Locale
  options?: TemplateOptions
}

export interface PdfTemplate<Data> {
  key: TemplateKey
  /** Zod schema for the `data` payload. */
  schema: z.ZodType<Data>
  /** Renders the full `<Document>`. */
  Component: (ctx: RenderContext<Data>) => DocumentElement
  /** Optional default filename builder; falls back to `<key>-<date>.pdf`. */
  filename?: (ctx: RenderContext<Data>) => string
}
