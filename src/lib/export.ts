/**
 * Export utility functions for CSV and PDF generation
 */

// Type for exportable data
type ExportableData = Record<string, unknown>

interface ExportOptions {
  filename: string
  title?: string
  headers?: string[]
}

/**
 * Escape a value for CSV format
 */
function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const stringValue = String(value)

  // If the value contains a comma, newline, or quote, wrap it in quotes
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

/**
 * Convert data to CSV format
 */
function dataToCSV(data: ExportableData[], columns?: string[]): string {
  if (data.length === 0) {
    return ''
  }

  // Get column headers from first item or use provided columns
  const headers = columns || Object.keys(data[0])

  // Create header row
  const headerRow = headers.map(escapeCSVValue).join(',')

  // Create data rows
  const dataRows = data.map((item) =>
    headers.map((header) => escapeCSVValue(item[header])).join(',')
  )

  return [headerRow, ...dataRows].join('\n')
}

/**
 * Trigger a file download in the browser
 * Includes UTF-8 BOM for proper Arabic text display in Excel
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  // Add UTF-8 BOM for Excel to correctly display Arabic/Unicode characters
  const bom = '\uFEFF'
  const blob = new Blob([bom + content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Export data to CSV file
 */
export function exportToCSV<T extends ExportableData>(
  data: T[],
  options: ExportOptions
): void {
  const csv = dataToCSV(data, options.headers)
  const filename = options.filename.endsWith('.csv') ? options.filename : `${options.filename}.csv`

  downloadFile(csv, filename, 'text/csv;charset=utf-8;')
}

/**
 * Export audit findings to CSV
 */
export function exportAuditFindings(
  findings: Array<{
    id: string
    name: string
    category: string
    severity: string
    owner?: { name: string }
    status: string
  }>,
  filename = 'audit-findings'
): void {
  const exportData = findings.map((finding) => ({
    ID: finding.id,
    Name: finding.name,
    Category: finding.category,
    Severity: finding.severity,
    Owner: finding.owner?.name || 'Unassigned',
    Status: finding.status,
  }))

  exportToCSV(exportData, {
    filename,
    headers: ['ID', 'Name', 'Category', 'Severity', 'Owner', 'Status'],
  })
}

/**
 * Translation function type for export localization
 * Uses generic type to accept any translation function signature
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFunction = (key: any, params?: any) => string

/**
 * Format date based on locale
 */
function formatExportDate(dateStr: string | undefined, isRTL: boolean, naText: string): string {
  if (!dateStr) return naText
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

/**
 * Export observations to CSV with localization support
 */
export function exportObservations(
  observations: Array<{
    id: string
    title: string
    subTitle?: string
    reference?: string
    description?: string
    source: string
    severity: string
    status: string
    dueDate?: string
    department?: string
    assignees?: Array<{ name: string; role?: string }>
    assignee?: { name: string; role?: string }
    documents?: Array<{ name: string }>
    checklist?: Array<{ completed: boolean }>
  }>,
  filename = 'observations',
  t?: TranslationFunction,
  isRTL = false
): void {
  // Default translations for backwards compatibility
  const getText = (key: string, fallback: string) => t ? t(key) : fallback

  const naText = getText('export.na', 'N/A')
  const unassignedText = getText('export.unassigned', 'Unassigned')
  const noneText = getText('export.none', 'None')
  const noChecklistText = getText('export.noChecklist', 'No checklist')

  const exportData = observations.map((obs) => {
    // Get assignees from assignees array or single assignee
    const assigneesList = obs.assignees && obs.assignees.length > 0
      ? obs.assignees.map(a => a.name).join('; ')
      : obs.assignee?.name || unassignedText

    // Get documents list
    const documentsList = obs.documents && obs.documents.length > 0
      ? obs.documents.map(d => d.name).join('; ')
      : noneText

    // Calculate checklist progress
    const checklistTotal = obs.checklist?.length || 0
    const checklistCompleted = obs.checklist?.filter(c => c.completed).length || 0
    const checklistProgress = checklistTotal > 0
      ? `${checklistCompleted}/${checklistTotal} (${Math.round((checklistCompleted / checklistTotal) * 100)}%)`
      : noChecklistText

    // Get translated source
    const sourceKey = `observations.sources.${obs.source}`
    const translatedSource = t ? t(sourceKey) : obs.source

    // Get translated severity
    const severityKey = `observations.severityOptions.${obs.severity}`
    const translatedSeverity = t ? t(severityKey) : obs.severity

    // Get translated status
    const statusKey = `observations.statusOptions.${obs.status === 'resolved' ? 'pendingReview' : obs.status === 'in_progress' ? 'inProgress' : obs.status}`
    const translatedStatus = t ? t(statusKey) : obs.status

    return {
      [getText('export.reference', 'Reference')]: obs.reference || naText,
      [getText('export.title', 'Title')]: obs.title,
      [getText('export.subTitle', 'Sub-Title')]: obs.subTitle || '',
      [getText('export.source', 'Source')]: translatedSource,
      [getText('export.severity', 'Severity')]: translatedSeverity,
      [getText('export.status', 'Status')]: translatedStatus,
      [getText('export.dueDate', 'Due Date')]: formatExportDate(obs.dueDate, isRTL, naText),
      [getText('export.department', 'Department')]: obs.department || naText,
      [getText('export.assignees', 'Assignees')]: assigneesList,
      [getText('export.description', 'Description')]: obs.description || '',
      [getText('export.documents', 'Documents')]: documentsList,
      [getText('export.checklistProgress', 'Checklist Progress')]: checklistProgress,
    }
  })

  // Localized headers
  const headers = [
    getText('export.reference', 'Reference'),
    getText('export.title', 'Title'),
    getText('export.subTitle', 'Sub-Title'),
    getText('export.source', 'Source'),
    getText('export.severity', 'Severity'),
    getText('export.status', 'Status'),
    getText('export.dueDate', 'Due Date'),
    getText('export.department', 'Department'),
    getText('export.assignees', 'Assignees'),
    getText('export.description', 'Description'),
    getText('export.documents', 'Documents'),
    getText('export.checklistProgress', 'Checklist Progress'),
  ]

  exportToCSV(exportData, {
    filename,
    headers,
  })
}

/**
 * Export audit logs to CSV
 */
export function exportAuditLogs(
  logs: Array<{
    id: number | string
    timestamp: string
    audit: string
    action: string
    description: string
    status: string
    user?: string
  }>,
  filename = 'audit-logs'
): void {
  const exportData = logs.map((log) => ({
    ID: log.id,
    Timestamp: log.timestamp,
    Audit: log.audit,
    Action: log.action,
    Description: log.description,
    Status: log.status,
    User: log.user || 'Unknown',
  }))

  exportToCSV(exportData, {
    filename,
    headers: ['ID', 'Timestamp', 'Audit', 'Action', 'Description', 'Status', 'User'],
  })
}

/**
 * Generate a simple HTML-based printable report (can be saved as PDF via browser print)
 */
export function generatePrintableReport(
  title: string,
  data: ExportableData[],
  options?: { columns?: string[]; subtitle?: string }
): void {
  if (data.length === 0) {
    alert('No data to export')
    return
  }

  const columns = options?.columns || Object.keys(data[0])

  const tableRows = data
    .map(
      (item) =>
        `<tr>${columns
          .map((col) => `<td style="border: 1px solid #ddd; padding: 8px;">${item[col] ?? ''}</td>`)
          .join('')}</tr>`
    )
    .join('')

  const tableHeaders = columns
    .map(
      (col) =>
        `<th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5; text-align: left;">${col}</th>`
    )
    .join('')

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        h2 { color: #666; font-size: 14px; font-weight: normal; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; }
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      ${options?.subtitle ? `<h2>${options.subtitle}</h2>` : ''}
      <table>
        <thead><tr>${tableHeaders}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="footer">
        Generated on ${new Date().toLocaleString()} | ComplianceOS
      </div>
      <div class="no-print" style="margin-top: 20px;">
        <button onclick="window.print()" style="padding: 10px 20px; cursor: pointer;">
          Print / Save as PDF
        </button>
      </div>
    </body>
    </html>
  `

  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}

/**
 * Export data to PDF via print dialog
 */
export function exportToPDF<T extends ExportableData>(
  data: T[],
  options: ExportOptions & { subtitle?: string }
): void {
  generatePrintableReport(options.title || options.filename, data, {
    columns: options.headers,
    subtitle: options.subtitle,
  })
}
