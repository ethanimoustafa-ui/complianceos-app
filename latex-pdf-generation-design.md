# ComplianceOS — LaTeX PDF Generation System

## Design Document

**Status:** Ready for backend implementation  
**Priority:** Implement when backend engineer joins  
**Scope:** Universal export — every page offers CSV or PDF (LaTeX)

---

## 1. Architecture Overview

### Flow

```
Frontend (Next.js)                    Backend (Node.js)
─────────────────                    ─────────────────
User clicks "Export"
       │
       ▼
  ExportModal opens
  (CSV or PDF?)
       │
       ├── CSV ──► Current client-side logic (no change)
       │
       └── PDF ──► POST /api/export/pdf
                   Body: { template, data, locale, options }
                          │
                          ▼
                   ┌─────────────────┐
                   │  Template Engine │
                   │  (Handlebars/EJS)│
                   │  populates .tex  │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │    pdflatex     │
                   │  compiles .tex  │
                   │  → .pdf output  │
                   └────────┬────────┘
                            │
                            ▼
                   Returns PDF binary
                   (Content-Type: application/pdf)
```

### Why pdflatex (not tectonic/xelatex)?

- **pdflatex** is the most stable, widely-supported LaTeX compiler
- Available in every Linux distro via `texlive`
- For Arabic/RTL support (future), switch to **xelatex** — same templates, just a different compiler flag
- Docker image: `texlive-full` or leaner `texlive-base` + specific packages

### Server Setup

```bash
# Ubuntu/Debian (production server or Docker)
apt-get install texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended

# For Arabic support (future)
apt-get install texlive-lang-arabic texlive-xetex
```

### Docker (recommended for isolation)

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]
```

---

## 2. API Contract

### Endpoint

```
POST /api/export/pdf
```

### Request Body

```typescript
interface PDFExportRequest {
  /** Which LaTeX template to use */
  template:
    | 'compliance-report'
    | 'audit-report'
    | 'observation-list'
    | 'risk-register'
    | 'sama-letter'
    | 'correspondence-tracker'
    | 'training-report'
    | 'calendar-export'
    | 'generic-table'    // fallback for any tabular data

  /** The data payload — shape depends on template */
  data: Record<string, unknown>

  /** Metadata that appears on every report */
  meta: {
    title: string
    subtitle?: string
    generatedBy: string        // user name
    organization: string       // company name
    locale: 'en' | 'ar'
    dateFormat?: string        // default: 'YYYY-MM-DD'
  }

  /** Template-specific options */
  options?: {
    orientation?: 'portrait' | 'landscape'
    includeCharts?: boolean
    includeSummary?: boolean
    watermark?: string         // e.g., "DRAFT", "CONFIDENTIAL"
    headerLogo?: string        // base64 encoded logo
  }
}
```

### Response

```
200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="compliance-report-2025-02.pdf"

<binary PDF data>
```

### Error Response

```json
{
  "error": "COMPILATION_FAILED",
  "message": "LaTeX compilation error on line 42: Undefined control sequence",
  "details": "<pdflatex stderr output>"
}
```

---

## 3. Frontend Changes

### 3.1 New Universal Export Modal

Every page that currently has an export button should use this shared modal:

```typescript
// src/components/ui/export-modal.tsx

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  /** What's being exported — used for filename and template selection */
  exportContext: {
    template: PDFExportRequest['template']
    title: string
    data: Record<string, unknown>[]
    csvHeaders?: string[]        // for CSV column mapping
    csvFilename?: string
  }
}

// Modal shows two options:
// ┌─────────────────────────────────────┐
// │         Export Data                  │
// │                                     │
// │   ┌─────────┐    ┌─────────┐       │
// │   │   CSV   │    │   PDF   │       │
// │   │  ≋≋≋≋  │    │  📄     │       │
// │   │ Tabular │    │ Styled  │       │
// │   │  Data   │    │ Report  │       │
// │   └─────────┘    └─────────┘       │
// │                                     │
// │  CSV: Instant client-side download  │
// │  PDF: Generates via LaTeX backend   │
// └─────────────────────────────────────┘
```

### 3.2 Export Service

```typescript
// src/services/export-service.ts

export async function exportToPDFViaLatex(
  request: PDFExportRequest
): Promise<Blob> {
  const response = await fetch('/api/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'PDF generation failed')
  }

  return response.blob()
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
```

### 3.3 Pages to Update

Every page with current export functionality needs the new ExportModal wired in:

| Page | Current Export | New Behavior |
|------|---------------|--------------|
| `/observations` | `exportObservations()` CSV | CSV or PDF via `observation-list` template |
| `/audits` | `exportAuditFindings()` CSV | CSV or PDF via `audit-report` template |
| `/audits/[id]` | `exportAuditLogs()` CSV | CSV or PDF via `audit-report` template |
| `/reports` | `generatePrintableReport()` HTML | CSV or PDF via template matching report type |
| `/correspondence` | Toast only ("Exporting...") | CSV or PDF via `correspondence-tracker` template |
| `/risk-register` | — | CSV or PDF via `risk-register` template |
| `/calendar` | — | CSV or PDF via `calendar-export` template |
| `/team` (training) | CSV | CSV or PDF via `training-report` template |
| `/dashboard` | — | PDF via `compliance-report` (executive summary) |

---

## 4. LaTeX Templates

### 4.1 Shared Preamble (base.tex)

Every template imports this. It defines the ComplianceOS visual identity.

```latex
% base.tex — ComplianceOS shared preamble
% ========================================

\documentclass[a4paper,11pt]{article}

% ── Core packages ──
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}                    % Modern Latin font
\usepackage[top=2cm,bottom=2.5cm,left=2cm,right=2cm]{geometry}
\usepackage{graphicx}
\usepackage{xcolor}
\usepackage{tabularx}
\usepackage{booktabs}                   % Professional tables
\usepackage{longtable}                  % Multi-page tables
\usepackage{multirow}
\usepackage{fancyhdr}                   % Headers/footers
\usepackage{titlesec}                   % Section formatting
\usepackage{enumitem}                   % List customization
\usepackage{hyperref}                   % Clickable links
\usepackage{lastpage}                   % "Page X of Y"
\usepackage{ifthen}                     % Conditional logic
\usepackage{tikz}                       % For charts/diagrams
\usepackage{pgfplots}                   % For data charts
\pgfplotsset{compat=1.18}
\usepackage{draftwatermark}             % Watermarks (DRAFT, CONFIDENTIAL)
\usepackage{etoolbox}                   % Boolean flags

% ── ComplianceOS Brand Colors ──
% Matches Tailwind design system
\definecolor{cos-emerald}{HTML}{10B981}    % Primary / success
\definecolor{cos-emerald-dark}{HTML}{059669}
\definecolor{cos-emerald-light}{HTML}{D1FAE5}
\definecolor{cos-slate-900}{HTML}{0F172A}  % Text primary
\definecolor{cos-slate-700}{HTML}{334155}  % Text secondary
\definecolor{cos-slate-500}{HTML}{64748B}  % Text muted
\definecolor{cos-slate-200}{HTML}{E2E8F0}  % Borders
\definecolor{cos-slate-50}{HTML}{F8FAFC}   % Backgrounds
\definecolor{cos-rose}{HTML}{F43F5E}       % Critical / error
\definecolor{cos-rose-light}{HTML}{FFE4E6}
\definecolor{cos-amber}{HTML}{F59E0B}      % Warning
\definecolor{cos-amber-light}{HTML}{FEF3C7}
\definecolor{cos-blue}{HTML}{3B82F6}       % Info
\definecolor{cos-blue-light}{HTML}{DBEAFE}

% ── Severity color commands ──
\newcommand{\severitycritical}[1]{\colorbox{cos-rose-light}{\textcolor{cos-rose}{\textbf{#1}}}}
\newcommand{\severityhigh}[1]{\colorbox{cos-rose-light}{\textcolor{cos-rose}{#1}}}
\newcommand{\severitymedium}[1]{\colorbox{cos-amber-light}{\textcolor{cos-amber}{#1}}}
\newcommand{\severitylow}[1]{\colorbox{cos-emerald-light}{\textcolor{cos-emerald-dark}{#1}}}

% ── Status badge commands ──
\newcommand{\statusopen}{\colorbox{cos-blue-light}{\textcolor{cos-blue}{\footnotesize\textbf{~OPEN~}}}}
\newcommand{\statusinprogress}{\colorbox{cos-amber-light}{\textcolor{cos-amber}{\footnotesize\textbf{~IN PROGRESS~}}}}
\newcommand{\statusclosed}{\colorbox{cos-emerald-light}{\textcolor{cos-emerald-dark}{\footnotesize\textbf{~CLOSED~}}}}
\newcommand{\statusoverdue}{\colorbox{cos-rose-light}{\textcolor{cos-rose}{\footnotesize\textbf{~OVERDUE~}}}}

% ── Page layout ──
\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\footrulewidth}{0.4pt}
\fancyhead[L]{\small\textcolor{cos-slate-500}{\leftmark}}
\fancyhead[R]{\small\textcolor{cos-slate-500}{ComplianceOS}}
\fancyfoot[L]{\small\textcolor{cos-slate-500}{Generated: \today}}
\fancyfoot[C]{\small\textcolor{cos-slate-500}{CONFIDENTIAL}}
\fancyfoot[R]{\small\textcolor{cos-slate-500}{Page \thepage\ of \pageref{LastPage}}}

% ── Section styling ──
\titleformat{\section}
  {\Large\bfseries\color{cos-slate-900}}
  {\thesection}{1em}{}
  [\vspace{-0.5em}{\color{cos-emerald}\rule{\textwidth}{2pt}}]

\titleformat{\subsection}
  {\large\bfseries\color{cos-slate-700}}
  {\thesubsection}{1em}{}

\titleformat{\subsubsection}
  {\normalsize\bfseries\color{cos-slate-700}}
  {\thesubsubsection}{1em}{}

% ── Hyperlink styling ──
\hypersetup{
  colorlinks=true,
  linkcolor=cos-emerald-dark,
  urlcolor=cos-blue,
  citecolor=cos-emerald-dark,
}

% ── List styling ──
\setlist[itemize]{leftmargin=1.5em, itemsep=2pt}
\setlist[enumerate]{leftmargin=1.5em, itemsep=2pt}

% ── Custom environments ──
\newenvironment{infobox}{%
  \begin{center}
  \begin{tabular}{|p{0.9\textwidth}|}
  \hline
  \rowcolor{cos-blue-light}
  \cellcolor{cos-blue-light}
}{%
  \\ \hline
  \end{tabular}
  \end{center}
}

\newenvironment{warningbox}{%
  \begin{center}
  \begin{tabular}{|p{0.9\textwidth}|}
  \hline
  \rowcolor{cos-amber-light}
  \cellcolor{cos-amber-light}
}{%
  \\ \hline
  \end{tabular}
  \end{center}
}

\newenvironment{criticalbox}{%
  \begin{center}
  \begin{tabular}{|p{0.9\textwidth}|}
  \hline
  \rowcolor{cos-rose-light}
  \cellcolor{cos-rose-light}
}{%
  \\ \hline
  \end{tabular}
  \end{center}
}

% ── Watermark (conditional) ──
% Set \watermarktext before \input{base.tex} to enable
% e.g., \newcommand{\watermarktext}{DRAFT}
\ifdefined\watermarktext
  \SetWatermarkText{\watermarktext}
  \SetWatermarkScale{0.5}
  \SetWatermarkColor[gray]{0.9}
\fi
```

### 4.2 Cover Page Component (cover.tex)

```latex
% cover.tex — Reusable cover page
% Expects: \reporttitle, \reportsubtitle, \reportorg, \reportauthor, \reportdate
% =============================================

\begin{titlepage}
  \centering
  \vspace*{2cm}

  % Logo placeholder
  % \includegraphics[width=4cm]{logo.png}
  % \vspace{1cm}

  {\color{cos-emerald}\rule{\textwidth}{3pt}}
  \vspace{1cm}

  {\Huge\bfseries\color{cos-slate-900}\reporttitle\par}
  \vspace{0.5cm}

  \ifdefined\reportsubtitle
    {\Large\color{cos-slate-500}\reportsubtitle\par}
    \vspace{0.5cm}
  \fi

  {\color{cos-emerald}\rule{0.5\textwidth}{1pt}}
  \vspace{2cm}

  \begin{tabular}{rl}
    \textcolor{cos-slate-500}{Organization:} & \textbf{\reportorg} \\[8pt]
    \textcolor{cos-slate-500}{Prepared by:} & \textbf{\reportauthor} \\[8pt]
    \textcolor{cos-slate-500}{Date:} & \textbf{\reportdate} \\[8pt]
    \textcolor{cos-slate-500}{Classification:} & \textbf{CONFIDENTIAL} \\
  \end{tabular}

  \vfill

  {\small\color{cos-slate-500}Generated by ComplianceOS\par}
  {\footnotesize\color{cos-slate-500}This document is auto-generated and subject to the organization's
  document control policies.\par}

\end{titlepage}
```

### 4.3 Template: Observation List

```latex
% observation-list.tex
% Data placeholders use Handlebars syntax: {{variable}}
% The backend template engine replaces these before compilation
% ========================================

\input{base}

\newcommand{\reporttitle}{Observations Report}
\newcommand{\reportsubtitle}{ {{subtitle}} }
\newcommand{\reportorg}{ {{organization}} }
\newcommand{\reportauthor}{ {{generatedBy}} }
\newcommand{\reportdate}{ {{date}} }

\begin{document}
\input{cover}

\tableofcontents
\newpage

% ── Executive Summary ──
\section{Executive Summary}

\begin{tabularx}{\textwidth}{|l|X|}
  \hline
  \rowcolor{cos-slate-50}
  \textbf{Metric} & \textbf{Value} \\
  \hline
  Total Observations & {{totalCount}} \\
  \hline
  Critical / High & \textcolor{cos-rose}{ {{criticalCount}} } / \textcolor{cos-rose}{ {{highCount}} } \\
  \hline
  Medium / Low & \textcolor{cos-amber}{ {{mediumCount}} } / \textcolor{cos-emerald-dark}{ {{lowCount}} } \\
  \hline
  Open & {{openCount}} \\
  \hline
  Overdue & \textcolor{cos-rose}{ {{overdueCount}} } \\
  \hline
  Average Resolution (days) & {{avgResolutionDays}} \\
  \hline
\end{tabularx}

\vspace{1em}

% ── Severity Breakdown Chart (TikZ/pgfplots) ──
\begin{center}
\begin{tikzpicture}
  \begin{axis}[
    ybar,
    bar width=20pt,
    width=0.7\textwidth,
    height=5cm,
    symbolic x coords={Critical,High,Medium,Low},
    xtick=data,
    ylabel={Count},
    ymin=0,
    nodes near coords,
    every node near coord/.style={font=\small\bfseries},
    bar shift=0pt,
  ]
    \addplot[fill=cos-rose]   coordinates {(Critical, {{criticalCount}} )};
    \addplot[fill=cos-amber]  coordinates {(High, {{highCount}} )};
    \addplot[fill=cos-blue]   coordinates {(Medium, {{mediumCount}} )};
    \addplot[fill=cos-emerald] coordinates {(Low, {{lowCount}} )};
  \end{axis}
\end{tikzpicture}
\end{center}

% ── Observations Table ──
\section{Observations Detail}

\begin{longtable}{|p{1.5cm}|p{4cm}|p{1.5cm}|p{2cm}|p{2cm}|p{2.5cm}|p{2cm}|}
  \hline
  \rowcolor{cos-slate-50}
  \textbf{Ref} & \textbf{Title} & \textbf{Severity} & \textbf{Source} & \textbf{Status} & \textbf{Assignee} & \textbf{Due Date} \\
  \hline
  \endfirsthead

  \hline
  \rowcolor{cos-slate-50}
  \textbf{Ref} & \textbf{Title} & \textbf{Severity} & \textbf{Source} & \textbf{Status} & \textbf{Assignee} & \textbf{Due Date} \\
  \hline
  \endhead

  \hline
  \multicolumn{7}{r}{\small\textit{Continued on next page...}} \\
  \endfoot

  \hline
  \endlastfoot

  %% BEGIN REPEAT: observations
  {{#each observations}}
  {{reference}} & {{title}} & {{severityBadge severity}} & {{source}} & {{statusBadge status}} & {{assignee}} & {{dueDate}} \\
  \hline
  {{/each}}
  %% END REPEAT

\end{longtable}

\end{document}
```

### 4.4 Template: Compliance Status Report (Executive Dashboard)

```latex
% compliance-report.tex
% ========================================

\input{base}

\newcommand{\reporttitle}{Compliance Status Report}
\newcommand{\reportsubtitle}{ {{period}} — {{organization}} }
\newcommand{\reportorg}{ {{organization}} }
\newcommand{\reportauthor}{ {{generatedBy}} }
\newcommand{\reportdate}{ {{date}} }

\begin{document}
\input{cover}

\tableofcontents
\newpage

% ── Overall Compliance Health ──
\section{Compliance Health Summary}

\begin{tabularx}{\textwidth}{|X|c|c|c|}
  \hline
  \rowcolor{cos-slate-50}
  \textbf{Framework} & \textbf{Score} & \textbf{Controls Mapped} & \textbf{Gaps} \\
  \hline
  {{#each frameworks}}
  {{name}} & {{score}}\% & {{controlsMapped}} / {{controlsTotal}} & {{gapCount}} \\
  \hline
  {{/each}}
\end{tabularx}

\vspace{1em}

% ── Compliance Score Trend (pgfplots) ──
\subsection{Score Trend — Last 6 Months}
\begin{center}
\begin{tikzpicture}
  \begin{axis}[
    width=0.85\textwidth,
    height=6cm,
    xlabel={Month},
    ylabel={Score (\%)},
    ymin=0, ymax=100,
    grid=major,
    grid style={cos-slate-200},
    symbolic x coords={ {{trendLabels}} },
    xtick=data,
    line width=1.5pt,
    mark=*,
    mark size=2pt,
    color=cos-emerald-dark,
  ]
    \addplot coordinates { {{trendData}} };
  \end{axis}
\end{tikzpicture}
\end{center}

% ── Open Observations Summary ──
\section{Open Observations}

\begin{tabularx}{\textwidth}{|c|X|c|c|c|}
  \hline
  \rowcolor{cos-slate-50}
  \textbf{\#} & \textbf{Observation} & \textbf{Severity} & \textbf{Owner} & \textbf{Due} \\
  \hline
  {{#each openObservations}}
  {{@index}} & {{title}} & {{severityBadge severity}} & {{owner}} & {{dueDate}} \\
  \hline
  {{/each}}
\end{tabularx}

% ── Upcoming Deadlines ──
\section{Upcoming Regulatory Deadlines}

\begin{tabularx}{\textwidth}{|l|X|c|c|}
  \hline
  \rowcolor{cos-slate-50}
  \textbf{Date} & \textbf{Item} & \textbf{Regulator} & \textbf{Status} \\
  \hline
  {{#each deadlines}}
  {{date}} & {{description}} & {{regulator}} & {{statusBadge status}} \\
  \hline
  {{/each}}
\end{tabularx}

\end{document}
```

### 4.5 Template: SAMA Correspondence Letter

```latex
% sama-letter.tex
% Formal letter format matching SAMA correspondence standards
% ========================================

\input{base}

% Override geometry for letter format
\newgeometry{top=3cm,bottom=2.5cm,left=2.5cm,right=2.5cm}

\begin{document}

\thispagestyle{empty}

% ── Letterhead ──
\begin{center}
  % \includegraphics[width=3cm]{company-logo.png} \\[0.5cm]
  {\Large\bfseries\color{cos-slate-900} {{organizationName}} }\\[4pt]
  {\small\color{cos-slate-500} {{organizationAddress}} }\\
  {\small\color{cos-slate-500} CR No.: {{crNumber}} }
\end{center}

\vspace{1cm}

{\color{cos-emerald}\rule{\textwidth}{2pt}}

\vspace{1cm}

% ── Letter metadata ──
\begin{tabular}{@{}ll}
  \textbf{Reference:} & {{letterReference}} \\
  \textbf{Date:}      & {{letterDate}} \\
  \textbf{To:}        & {{recipientName}} \\
                       & {{recipientTitle}} \\
                       & Saudi Central Bank (SAMA) \\
  \textbf{Subject:}   & \textbf{ {{subject}} } \\
\end{tabular}

\vspace{1cm}

% ── Salutation ──
Dear {{recipientTitle}} {{recipientName}},

\vspace{0.5cm}

% ── Body ──
{{#each bodyParagraphs}}
{{this}}

\vspace{0.3cm}
{{/each}}

% ── Attachments list ──
{{#if attachments}}
\vspace{0.5cm}
\textbf{Attachments:}
\begin{enumerate}[label=\arabic*., leftmargin=2em]
  {{#each attachments}}
  \item {{this}}
  {{/each}}
\end{enumerate}
{{/if}}

\vspace{1cm}

% ── Signature block ──
Respectfully,

\vspace{1.5cm}

\begin{tabular}{@{}l}
  \textbf{ {{signatoryName}} } \\
  {{signatoryTitle}} \\
  {{organizationName}} \\
\end{tabular}

\end{document}
```

### 4.6 Template: Audit Report

```latex
% audit-report.tex
% ========================================

\input{base}

\newcommand{\reporttitle}{Audit Report}
\newcommand{\reportsubtitle}{ {{auditName}} }
\newcommand{\reportorg}{ {{organization}} }
\newcommand{\reportauthor}{ {{leadAuditor}} }
\newcommand{\reportdate}{ {{date}} }

\begin{document}
\input{cover}

\tableofcontents
\newpage

% ── Audit Metadata ──
\section{Audit Information}

\begin{tabularx}{\textwidth}{|l|X|}
  \hline
  \rowcolor{cos-slate-50}
  \textbf{Field} & \textbf{Details} \\
  \hline
  Audit Name     & {{auditName}} \\  \hline
  Framework      & {{framework}} \\  \hline
  Scope          & {{scope}} \\      \hline
  Lead Auditor   & {{leadAuditor}} \\ \hline
  Start Date     & {{startDate}} \\  \hline
  End Date       & {{endDate}} \\    \hline
  Status         & {{statusBadge status}} \\ \hline
\end{tabularx}

% ── Findings Summary ──
\section{Findings Summary}

\begin{tabularx}{\textwidth}{|X|c|c|c|c|}
  \hline
  \rowcolor{cos-slate-50}
  & \textbf{Critical} & \textbf{High} & \textbf{Medium} & \textbf{Low} \\
  \hline
  Count & \textcolor{cos-rose}{ {{criticalFindings}} } & \textcolor{cos-rose}{ {{highFindings}} } & \textcolor{cos-amber}{ {{mediumFindings}} } & \textcolor{cos-emerald-dark}{ {{lowFindings}} } \\
  \hline
\end{tabularx}

% ── Detailed Findings ──
\section{Detailed Findings}

{{#each findings}}
\subsection{ {{name}} }

\begin{tabularx}{\textwidth}{|l|X|}
  \hline
  \rowcolor{cos-slate-50}
  \textbf{Attribute} & \textbf{Detail} \\
  \hline
  Severity    & {{severityBadge severity}} \\  \hline
  Category    & {{category}} \\                \hline
  Owner       & {{owner}} \\                   \hline
  Status      & {{statusBadge status}} \\      \hline
  Description & {{description}} \\             \hline
  Remediation & {{remediation}} \\             \hline
\end{tabularx}

\vspace{0.5em}
{{/each}}

% ── Activity Log ──
\section{Audit Activity Log}

\begin{longtable}{|p{3cm}|p{2.5cm}|p{3cm}|p{5cm}|p{2cm}|}
  \hline
  \rowcolor{cos-slate-50}
  \textbf{Timestamp} & \textbf{User} & \textbf{Action} & \textbf{Description} & \textbf{Status} \\
  \hline
  \endfirsthead
  \hline
  \rowcolor{cos-slate-50}
  \textbf{Timestamp} & \textbf{User} & \textbf{Action} & \textbf{Description} & \textbf{Status} \\
  \hline
  \endhead

  {{#each activityLogs}}
  {{timestamp}} & {{user}} & {{action}} & {{description}} & {{statusBadge status}} \\
  \hline
  {{/each}}

\end{longtable}

\end{document}
```

### 4.7 Template: Risk Register

```latex
% risk-register.tex
% ========================================

\input{base}

% Landscape for wide risk matrix tables
\geometry{landscape,top=1.5cm,bottom=2cm,left=1.5cm,right=1.5cm}

\newcommand{\reporttitle}{Risk Register}
\newcommand{\reportsubtitle}{ {{period}} }
\newcommand{\reportorg}{ {{organization}} }
\newcommand{\reportauthor}{ {{generatedBy}} }
\newcommand{\reportdate}{ {{date}} }

\begin{document}
\input{cover}

\section{Risk Summary}

\begin{tabularx}{\textwidth}{|l|c|c|c|c|}
  \hline
  \rowcolor{cos-slate-50}
  & \textbf{Critical} & \textbf{High} & \textbf{Medium} & \textbf{Low} \\
  \hline
  Count     & \textcolor{cos-rose}{ {{criticalRisks}} } & {{highRisks}} & {{mediumRisks}} & {{lowRisks}} \\ \hline
  Mitigated & {{criticalMitigated}} & {{highMitigated}} & {{mediumMitigated}} & {{lowMitigated}} \\ \hline
\end{tabularx}

\section{Risk Register}

\begin{longtable}{|p{0.8cm}|p{4cm}|p{2cm}|c|c|c|p{3cm}|p{2cm}|p{2.5cm}|p{2cm}|}
  \hline
  \rowcolor{cos-slate-50}
  \textbf{ID} & \textbf{Risk} & \textbf{Category} & \textbf{L} & \textbf{I} & \textbf{Score} & \textbf{Mitigation} & \textbf{Owner} & \textbf{Treatment} & \textbf{Status} \\
  \hline
  \endfirsthead
  \hline
  \rowcolor{cos-slate-50}
  \textbf{ID} & \textbf{Risk} & \textbf{Category} & \textbf{L} & \textbf{I} & \textbf{Score} & \textbf{Mitigation} & \textbf{Owner} & \textbf{Treatment} & \textbf{Status} \\
  \hline
  \endhead

  {{#each risks}}
  {{id}} & {{name}} & {{category}} & {{likelihood}} & {{impact}} & {{riskScore}} & {{mitigation}} & {{owner}} & {{treatment}} & {{statusBadge status}} \\
  \hline
  {{/each}}

\end{longtable}

% ── 5x5 Risk Matrix (TikZ) ──
\section{Risk Heat Map}

\begin{center}
\begin{tikzpicture}[scale=1.2]
  % Grid
  \foreach \x in {0,...,4} {
    \foreach \y in {0,...,4} {
      \pgfmathtruncatemacro{\score}{(\x+1)*(\y+1)}
      % Color based on score
      \ifnum\score>15
        \fill[cos-rose!60] (\x,\y) rectangle (\x+1,\y+1);
      \else\ifnum\score>9
        \fill[cos-amber!50] (\x,\y) rectangle (\x+1,\y+1);
      \else\ifnum\score>4
        \fill[cos-blue!30] (\x,\y) rectangle (\x+1,\y+1);
      \else
        \fill[cos-emerald!30] (\x,\y) rectangle (\x+1,\y+1);
      \fi\fi\fi
      \draw[cos-slate-200] (\x,\y) rectangle (\x+1,\y+1);
      \node[font=\small] at (\x+0.5,\y+0.5) {\score};
    }
  }
  % Axis labels
  \node[below,font=\bfseries] at (2.5,-0.3) {Likelihood →};
  \node[left,rotate=90,font=\bfseries] at (-0.3,2.5) {Impact →};
  \foreach \i/\label in {0/1,1/2,2/3,3/4,4/5} {
    \node[below,font=\footnotesize] at (\i+0.5,0) {\label};
    \node[left,font=\footnotesize] at (0,\i+0.5) {\label};
  }

  % Plot actual risks as dots
  {{#each riskPlots}}
  \node[circle,fill=cos-slate-900,inner sep=2pt] at ({{x}},{{y}}) {};
  \node[font=\tiny,above right] at ({{x}},{{y}}) { {{label}} };
  {{/each}}

\end{tikzpicture}
\end{center}

\end{document}
```

### 4.8 Template: Generic Table (Fallback)

```latex
% generic-table.tex
% Used when no specific template exists for the export context
% ========================================

\input{base}

\newcommand{\reporttitle}{ {{title}} }
\newcommand{\reportorg}{ {{organization}} }
\newcommand{\reportauthor}{ {{generatedBy}} }
\newcommand{\reportdate}{ {{date}} }

\begin{document}
\input{cover}

\section{ {{title}} }

{{#if subtitle}}
\textcolor{cos-slate-500}{ {{subtitle}} }
\vspace{1em}
{{/if}}

% Column count and widths are dynamically generated
\begin{longtable}{ {{columnSpec}} }
  \hline
  \rowcolor{cos-slate-50}
  {{headerRow}} \\
  \hline
  \endfirsthead
  \hline
  \rowcolor{cos-slate-50}
  {{headerRow}} \\
  \hline
  \endhead

  {{#each rows}}
  {{this}} \\
  \hline
  {{/each}}

\end{longtable}

\end{document}
```

---

## 5. Backend Implementation Guide

### 5.1 Template Engine (Node.js)

```typescript
// src/services/latex/template-engine.ts

import Handlebars from 'handlebars'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Register custom Handlebars helpers for LaTeX
Handlebars.registerHelper('severityBadge', (severity: string) => {
  const map: Record<string, string> = {
    critical: '\\severitycritical{CRITICAL}',
    high:     '\\severityhigh{HIGH}',
    medium:   '\\severitymedium{MEDIUM}',
    low:      '\\severitylow{LOW}',
  }
  return new Handlebars.SafeString(map[severity.toLowerCase()] || severity)
})

Handlebars.registerHelper('statusBadge', (status: string) => {
  const map: Record<string, string> = {
    open:        '\\statusopen',
    in_progress: '\\statusinprogress',
    closed:      '\\statusclosed',
    overdue:     '\\statusoverdue',
  }
  return new Handlebars.SafeString(map[status.toLowerCase()] || status)
})

Handlebars.registerHelper('escapeLatex', (text: string) => {
  // Escape LaTeX special characters
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}~^]/g, (match) => `\\${match}`)
})

interface CompileOptions {
  template: string
  data: Record<string, unknown>
  meta: Record<string, unknown>
  options?: Record<string, unknown>
}

export async function compileLatexToPDF(opts: CompileOptions): Promise<Buffer> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'complianceos-latex-'))

  try {
    // 1. Copy shared files (base.tex, cover.tex) to temp dir
    const templatesDir = path.resolve(__dirname, '../templates/latex')
    fs.copyFileSync(
      path.join(templatesDir, 'base.tex'),
      path.join(tmpDir, 'base.tex')
    )
    fs.copyFileSync(
      path.join(templatesDir, 'cover.tex'),
      path.join(tmpDir, 'cover.tex')
    )

    // 2. Copy logo if provided
    if (opts.options?.headerLogo) {
      const logoBuffer = Buffer.from(opts.options.headerLogo as string, 'base64')
      fs.writeFileSync(path.join(tmpDir, 'logo.png'), logoBuffer)
    }

    // 3. Load and compile the template
    const templatePath = path.join(templatesDir, `${opts.template}.tex`)
    const templateSource = fs.readFileSync(templatePath, 'utf-8')
    const compiled = Handlebars.compile(templateSource)

    // 4. Merge data + meta and render
    const texContent = compiled({
      ...opts.data,
      ...opts.meta,
      date: opts.meta.dateFormat
        ? formatDate(new Date(), opts.meta.dateFormat as string)
        : new Date().toISOString().split('T')[0],
    })

    // 5. Write .tex file
    const texPath = path.join(tmpDir, 'report.tex')
    fs.writeFileSync(texPath, texContent)

    // 6. Compile with pdflatex (run twice for TOC/references)
    const pdflatexCmd = `pdflatex -interaction=nonstopmode -output-directory="${tmpDir}" "${texPath}"`
    execSync(pdflatexCmd, { timeout: 30000 })
    execSync(pdflatexCmd, { timeout: 30000 }) // Second pass for TOC

    // 7. Read and return PDF
    const pdfPath = path.join(tmpDir, 'report.pdf')
    return fs.readFileSync(pdfPath)

  } finally {
    // Cleanup temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}
```

### 5.2 API Route Handler

```typescript
// src/routes/export.ts (Express example)

import { Router } from 'express'
import { compileLatexToPDF } from '../services/latex/template-engine'
import { authMiddleware } from '../middleware/auth'
import { auditLog } from '../services/audit'

const router = Router()

router.post('/api/export/pdf', authMiddleware, async (req, res) => {
  const { template, data, meta, options } = req.body

  try {
    const pdfBuffer = await compileLatexToPDF({ template, data, meta, options })

    // Audit log the export
    await auditLog({
      action: 'EXPORT_PDF',
      user: req.user.id,
      details: { template, title: meta.title },
    })

    const filename = `${meta.title.replace(/\s+/g, '-').toLowerCase()}-${meta.dateFormat || new Date().toISOString().split('T')[0]}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(pdfBuffer)

  } catch (error) {
    console.error('PDF generation failed:', error)
    res.status(500).json({
      error: 'COMPILATION_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
```

### 5.3 LaTeX Security — Input Sanitization

**Critical for production.** User-supplied data must be sanitized before injecting into LaTeX:

```typescript
// src/services/latex/sanitize.ts

/**
 * Escapes all LaTeX special characters in user input.
 * MUST be applied to every dynamic value before template rendering.
 */
export function sanitizeForLatex(input: string): string {
  if (!input) return ''

  return input
    // Backslash first (before adding more backslashes)
    .replace(/\\/g, '\\textbackslash{}')
    // LaTeX special characters
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/%/g, '\\%')
    .replace(/&/g, '\\&')
    .replace(/_/g, '\\_')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    // Prevent LaTeX command injection
    .replace(/\\textbackslash\{\}(input|include|write|read|def|newcommand)/g, '[blocked]')
}

/**
 * Recursively sanitize all string values in a data object
 */
export function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeForLatex(value)
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? sanitizeData(item as Record<string, unknown>)
          : typeof item === 'string'
          ? sanitizeForLatex(item)
          : item
      )
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}
```

---

## 6. File Structure

```
src/
├── services/
│   └── latex/
│       ├── template-engine.ts      # Handlebars + pdflatex compilation
│       ├── sanitize.ts             # LaTeX input sanitization
│       └── helpers.ts              # Handlebars helpers (severityBadge, etc.)
├── templates/
│   └── latex/
│       ├── base.tex                # Shared preamble (colors, layout, commands)
│       ├── cover.tex               # Cover page component
│       ├── observation-list.tex    # Observations export
│       ├── compliance-report.tex   # Executive compliance summary
│       ├── audit-report.tex        # Audit report with findings
│       ├── risk-register.tex       # Risk register (landscape)
│       ├── sama-letter.tex         # SAMA correspondence letter
│       ├── correspondence-tracker.tex
│       ├── training-report.tex
│       ├── calendar-export.tex
│       └── generic-table.tex       # Fallback for any tabular data
├── routes/
│   └── export.ts                   # POST /api/export/pdf
└── components/
    └── ui/
        └── export-modal.tsx        # Shared CSV/PDF export modal
```

---

## 7. Arabic / RTL Support (Future)

When Arabic support is needed:

1. Switch compiler from `pdflatex` to `xelatex`
2. Add to base.tex:
```latex
\usepackage{polyglossia}
\setmainlanguage{arabic}
\setotherlanguage{english}
\setmainfont{Amiri}           % Or any Arabic-supporting font
\newfontfamily\arabicfont{Amiri}
```
3. Wrap Arabic content in `\begin{Arabic}...\end{Arabic}`
4. Templates already support locale-aware rendering via the `meta.locale` field

---

## 8. Implementation Checklist for Backend Engineer

### Phase 1: Foundation
- [ ] Install `texlive-latex-recommended` + `texlive-latex-extra` on server/Docker
- [ ] Set up `src/templates/latex/` directory with `base.tex` and `cover.tex`
- [ ] Implement `sanitize.ts` (LaTeX input sanitization) — **security critical**
- [ ] Implement `template-engine.ts` (Handlebars compilation + pdflatex)
- [ ] Create `POST /api/export/pdf` endpoint with auth middleware
- [ ] Add audit logging for all PDF exports

### Phase 2: Templates
- [ ] `generic-table.tex` — test with arbitrary data
- [ ] `observation-list.tex` — test with observations store data
- [ ] `audit-report.tex` — test with audit findings
- [ ] `compliance-report.tex` — test with dashboard data
- [ ] `risk-register.tex` — test with risk data
- [ ] `sama-letter.tex` — test with correspondence data

### Phase 3: Frontend Integration
- [ ] Build shared `ExportModal` component (CSV / PDF choice)
- [ ] Create `export-service.ts` (API client for PDF endpoint)
- [ ] Wire ExportModal into all pages (see table in Section 3.3)
- [ ] Remove old `generatePrintableReport()` HTML-based PDF logic
- [ ] Add loading state / progress indicator for PDF generation

### Phase 4: Polish
- [ ] Company logo upload and inclusion in templates
- [ ] Watermark support (DRAFT, CONFIDENTIAL)
- [ ] Email delivery of generated reports (for scheduled reports)
- [ ] Arabic/RTL template variants
- [ ] Performance optimization (template caching, pre-compiled Handlebars)
```
