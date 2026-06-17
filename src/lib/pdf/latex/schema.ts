// Data contract for the LaTeX SAMA-letter template.
//
// Field names mirror the app's `Letter` model (src/types/index.ts) and the
// on-screen letter preview in the letters page, so the PDF reproduces exactly
// what the UI shows: a recipient block (إلى / name / org / city), a reference +
// dual Hijri/Gregorian date block, a bold subject, salutation, body, closing,
// and a signer name + title. The letterhead is the banner image, not text.
//
// `renderSamaLetterTex` validates against this before building the .tex.

import { z } from 'zod'

export const SamaLetterLatexDataSchema = z.object({
  /** Sender org (metadata only — the visible letterhead is the banner image). */
  organizationName: z.string().default('الشركة المتحدة للخدمات المالية'),

  /** App letter reference / ID, e.g. "SAMA-NOB-2026-0001". Rendered LTR. */
  reference: z.string(),
  /** Hijri (Umm al-Qura) date "dd/MM/yyyy"; the "هـ" marker is added by the template. */
  hijriDate: z.string(),
  /** Gregorian date "dd/MM/yyyy"; the "م" marker is added by the template. */
  gregorianDate: z.string(),

  /** Recipient block — matches Letter.recipientName/Org/City (+ Ar variants). */
  recipientName: z.string().default(''),
  recipientOrg: z.string().optional(),
  recipientCity: z.string().optional(),

  /** Opening greeting. Defaults to the app's "السادة الكرام،". */
  salutation: z.string().optional(),
  subject: z.string(),

  /** Preferred: one entry per paragraph. */
  bodyParagraphs: z.array(z.string()).default([]),
  /** Fallback single-string body (split on blank lines) when bodyParagraphs is empty. */
  body: z.string().optional(),

  /** Closing line. Defaults to the app's "وتقبلوا خالص التحية والتقدير،،". */
  closing: z.string().optional(),

  /** Signature block — matches Letter.signerName/signerTitle (+ Ar variants). */
  signerName: z.string().default(''),
  signerTitle: z.string().optional(),

  /** Attachment captions, listed under "المرفقات". */
  attachments: z.array(z.string()).default([]),
})

export type SamaLetterLatexData = z.infer<typeof SamaLetterLatexDataSchema>
