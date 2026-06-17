// Builds the xelatex `.tex` source for a SAMA / regulatory correspondence
// letter, in Arabic (RTL) or English (LTR), reproducing the app's on-screen
// letter layout (letters page preview):
//
//   [ letterhead banner ]
//   [ recipient block (To/إلى + name/org/city) ]   [ reference + dates ]
//   <subject> (bold)
//   <salutation>
//   <body paragraphs>
//   <closing>
//   <signer name (bold)> / <signer title>
//   [ optional attachments ]
//   ── footer: company registration fine-print + GPTW badge ──
//
// Pipeline: validate (Zod) -> escape every dynamic value (LaTeX injection gate)
// -> assemble with `String.raw` -> { tex, assets, filename }. The renderer
// container compiles it with xelatex (twice, for `lastpage`).

import { SamaLetterLatexDataSchema, type SamaLetterLatexData } from './schema'
import { escapeLatex } from './sanitize'
import { LETTERHEAD_PNG_B64, GPTW_BADGE_PNG_B64 } from './assets'

const RAW = String.raw

export type LatexLocale = 'en' | 'ar'

// Static labels / boilerplate per locale.
const LABELS = {
  ar: {
    to: 'إلى:',
    ref: 'المرجع:',
    date: 'التاريخ:',
    greg: 'الموافق:',
    subject: 'الموضوع:',
    salutation: 'السادة الكرام،',
    closing: 'وتقبلوا خالص التحية والتقدير،،',
    attachments: 'المرفقات:',
  },
  en: {
    to: 'To:',
    ref: 'Ref:',
    date: 'Date:',
    hijri: 'Hijri:',
    subject: 'Subject:',
    salutation: 'Dear Sir/Madam,',
    closing: 'Yours sincerely,',
    attachments: 'Attachments:',
  },
} as const

// Company registration fine-print (footer), transcribed from the official
// letterhead. Numeric/code runs in the Arabic version are wrapped in
// \textenglish so bidi keeps them left-to-right (and in order).
const FOOTER = {
  ar:
    'الشركة المتحدة للخدمات المالية، شركة مساهمة مقفلة، مركزها الرئيسي: المملكة العربية السعودية — مدينة الخبر، س.ت~\\textenglish{2031224103}، رأس المال المدفوع: \\textenglish{350.000.000} ريال سعودي، خاضعة لإشراف ورقابة البنك المركزي السعودي رقم ترخيص~\\textenglish{52/أش/201905}، عنوان وطني: مالك بن قيس حي الروابي — وحدة رقم~\\textenglish{8872} الخبر~\\textenglish{34421-3176}\\\\[2pt]\n' +
    'هاتف:~\\textenglish{+966138478888}\\quad فاكس:~\\textenglish{+966138587799}',
  en:
    'United Company for Financial Services, a closed joint-stock company. Head office: Al Khobar, Saudi Arabia — C.R. 2031224103. Paid-up capital: SAR 350,000,000. Licensed and supervised by the Saudi Central Bank (license No. 52/ASH/201905). National address: Malik bin Qais, Al Rawabi District — Unit No. 8872, Al Khobar 34421-3176.\\\\[2pt]\n' +
    'Tel: +966138478888 \\quad Fax: +966138587799',
} as const

export interface BuiltTex {
  tex: string
  /** filename -> base64 PNG, written into the compile dir by the renderer. */
  assets: Record<string, string>
  filename: string
}

function paragraphsFor(d: SamaLetterLatexData): string[] {
  if (d.bodyParagraphs && d.bodyParagraphs.length > 0) return d.bodyParagraphs
  if (d.body) {
    return d.body
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
  }
  return []
}

function safeFilename(reference: string): string {
  const base = reference.replace(/[^\p{L}\p{N}\-_]+/gu, '_').replace(/_+/g, '_').slice(0, 80)
  return `Letter-${base || 'sama'}.pdf`
}

/**
 * Build the .tex source for a SAMA letter in the given locale.
 * `input` is validated against `SamaLetterLatexDataSchema` (throws on mismatch).
 * The letters page selects the locale-appropriate fields (Ar vs En) before
 * calling, and passes `locale` so labels/direction/footer match.
 */
export function buildSamaLetterTex(input: unknown, locale: LatexLocale = 'ar'): BuiltTex {
  const data = SamaLetterLatexDataSchema.parse(input)
  const isEn = locale === 'en'
  const L = isEn ? LABELS.en : LABELS.ar

  // LTR-protect a token: English doc is already LTR; Arabic doc needs \textenglish.
  const lr = (s: string) => (isEn ? s : `\\textenglish{${s}}`)

  const reference = lr(escapeLatex(data.reference))
  const hijri = lr(escapeLatex(data.hijriDate))
  const greg = lr(escapeLatex(data.gregorianDate))
  const subject = escapeLatex(data.subject)
  const salutation = escapeLatex(data.salutation ?? L.salutation)
  const closing = escapeLatex(data.closing ?? L.closing)
  const signerName = escapeLatex(data.signerName)
  const signerTitle = data.signerTitle ? escapeLatex(data.signerTitle) : ''

  const recipientBlock = [
    data.recipientName ? `\\textbf{${L.to}~${escapeLatex(data.recipientName)}}` : null,
    data.recipientOrg ? escapeLatex(data.recipientOrg) : null,
    data.recipientCity ? escapeLatex(data.recipientCity) : null,
  ]
    .filter(Boolean)
    .join(' \\\\\n')

  const dateBlock = isEn
    ? `${L.ref}~${reference}\\\\\n${L.date}~${greg}\\\\\n${(L as typeof LABELS.en).hijri}~${hijri}~H`
    : `${L.ref}~${reference}\\\\\n${L.date}~${hijri}~هـ\\\\\n${(L as typeof LABELS.ar).greg}~${greg}~م`

  const bodyTex = paragraphsFor(data).map((p) => escapeLatex(p)).join('\n\n')

  const signatureBlock = [signerName ? `\\textbf{${signerName}}` : null, signerTitle || null]
    .filter(Boolean)
    .join(' \\\\\n')

  // Uploaded signature image. The job runner resolves the URL/data-URI to a
  // base64 `signature` asset (png or jpg) and injects it; here we just emit the
  // \includegraphics above the name (extension-less so graphicx picks the file).
  // When there's no image, fall back to a sign-here rule line under the name.
  const signatureImageTex = data.signatureImageUrl
    ? '\\noindent\\includegraphics[height=1.6cm]{signature}\\\\[2pt]\n'
    : ''
  const signatureLineTex = data.signatureImageUrl
    ? ''
    : '\n\n\\vspace{1.1cm}\n\\noindent\\rule{6cm}{0.4pt}'

  const attachmentItems = (data.attachments ?? [])
    .map((a) => `\\item ${escapeLatex(a)}`)
    .join('\n')
  const attachmentsBlock = attachmentItems
    ? RAW`
\vspace{0.5cm}
\noindent\textbf{${L.attachments}}
\begin{enumerate}
${attachmentItems}
\end{enumerate}`
    : ''

  const footerText = isEn ? FOOTER.en : FOOTER.ar

  // ── Preamble (locale-specific): EN is plain LTR; AR uses polyglossia RTL. ──
  const fontSetup = isEn
    ? RAW`\setmainfont{Latin Modern Roman}`
    : RAW`\usepackage{polyglossia}
\setmainlanguage{arabic}
\setotherlanguage{english}
\setmainfont{Amiri}[Script=Arabic]
\newfontfamily\arabicfont[Script=Arabic]{Amiri}`

  const preamble = RAW`\documentclass[12pt,a4paper]{article}
\usepackage{fontspec}
\usepackage{geometry}
\geometry{a4paper,top=2cm,bottom=3.6cm,left=2.5cm,right=2.5cm}
\usepackage{graphicx}
\usepackage{xcolor}
\definecolor{brandgreen}{HTML}{60B848}
\definecolor{footgray}{HTML}{6B7280}
\usepackage{fancyhdr}
\usepackage{lastpage}
% bidi (via polyglossia) must load after color/graphicx/fancyhdr.
${fontSetup}
\setlength{\parindent}{0pt}
\setlength{\parskip}{8pt}
\linespread{1.3}
\setlength{\footskip}{1.3cm}
\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0.6pt}
\renewcommand{\footrule}{{\color{brandgreen}\hrule height \footrulewidth}}
\fancyfoot[C]{%
  \begin{minipage}[t]{\textwidth}\centering
  \includegraphics[height=0.7cm]{badge.png}\\[3pt]
  {\scriptsize\color{footgray} ${footerText}}
  \end{minipage}%
}`

  const tex = RAW`${preamble}
\begin{document}

% ── Letterhead banner (compact, leading edge) ──
\noindent\includegraphics[width=7.5cm]{letterhead.png}\par
\vspace{0.12cm}
{\color{brandgreen}\hrule height 1pt}
\vspace{0.7cm}

% ── Recipient (leading side) + reference/dates (trailing side) ──
\noindent
\begin{minipage}[t]{0.56\textwidth}
${recipientBlock}
\end{minipage}%
\hfill
\begin{minipage}[t]{0.40\textwidth}
${dateBlock}
\end{minipage}

\vspace{0.8cm}

% ── Subject ──
\noindent\textbf{\large ${L.subject}~${subject}}

\vspace{0.5cm}

% ── Salutation ──
\noindent ${salutation}

\vspace{0.3cm}

% ── Body ──
${bodyTex}

\vspace{0.9cm}

% ── Closing ──
\noindent ${closing}

\vspace{0.8cm}

% ── Signature: uploaded image (if any) above the signer name + title ──
${signatureImageTex}\noindent ${signatureBlock}${signatureLineTex}
${attachmentsBlock}

\end{document}
`

  return {
    tex,
    assets: { 'letterhead.png': LETTERHEAD_PNG_B64, 'badge.png': GPTW_BADGE_PNG_B64 },
    filename: safeFilename(data.reference),
  }
}
